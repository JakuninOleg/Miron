import { expect, test, type Page, type Route } from "@playwright/test";

interface VoiceFixture {
  starts: number;
  stops: number;
  trackStops: number;
  transcriptions: number;
  constructors: string[];
  probes: string[];
  lateChunk: () => void;
  resolvePermission: () => void;
  resolveTranscript: () => void;
  interrupt: (event: "pause" | "ended") => void;
  emitBytes: (bytes: number) => void;
}

async function installRecorder(
  page: Page,
  options: {
    deny?: boolean;
    pendingPermission?: boolean;
    failPreferred?: boolean;
    lateResponse?: boolean;
  } = {},
) {
  await page.addInitScript((settings) => {
    const fixture: VoiceFixture = {
      starts: 0,
      stops: 0,
      trackStops: 0,
      transcriptions: 0,
      constructors: [],
      probes: [],
      lateChunk: () => undefined,
      resolvePermission: () => undefined,
      resolveTranscript: () => undefined,
      interrupt: () => undefined,
      emitBytes: () => undefined,
    };
    class TrackFixture extends EventTarget {
      readyState = "live";
      stop() {
        if (this.readyState === "live") fixture.trackStops++;
        this.readyState = "ended";
      }
    }
    const track = new TrackFixture();
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (settings.deny) throw new DOMException("Denied by fixture", "NotAllowedError");
          if (settings.pendingPermission)
            await new Promise<void>((resolve) => {
              fixture.resolvePermission = resolve;
            });
          return stream;
        },
      },
    });
    class RecorderFixture {
      state = "inactive";
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onpause: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        fixture.constructors.push(options?.mimeType ?? "browser-default");
        this.mimeType = options?.mimeType ?? "audio/mp4";
      }
      static isTypeSupported(type: string) {
        fixture.probes.push(type);
        return true;
      }
      start() {
        if (settings.failPreferred && this.mimeType.includes("webm"))
          throw new DOMException("Fixture codec failure", "NotSupportedError");
        this.state = "recording";
        fixture.starts++;
        this.ondataavailable?.({ data: new Blob(["initial-"], { type: this.mimeType }) });
        const callback = this.ondataavailable;
        fixture.lateChunk = () =>
          callback?.({ data: new Blob(["discarded-late-chunk"], { type: this.mimeType }) });
        fixture.emitBytes = (bytes) =>
          this.ondataavailable?.({
            data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }),
          });
        fixture.interrupt = (event) =>
          event === "pause" ? this.onpause?.() : track.dispatchEvent(new Event("ended"));
      }
      stop() {
        this.state = "inactive";
        fixture.stops++;
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(["final"], { type: this.mimeType }) });
          this.onstop?.();
        }, 30);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: RecorderFixture });
    Object.defineProperty(window, "mironVoiceFixture", { value: fixture });
    if (settings.lateResponse) {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        if (input === "/api/voice/transcribe" && init?.body instanceof FormData) {
          fixture.transcriptions++;
          const operationId = init.body.get("operationId");
          // Intentionally ignores abort to exercise the stale-result guard as well as cancellation.
          return new Promise<Response>((resolve) => {
            fixture.resolveTranscript = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    operationId,
                    text: "поздняя расшифровка",
                    provider: "local",
                    model: "fixture",
                    durationMs: 1000,
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } },
                ),
              );
          });
        }
        return originalFetch(input, init);
      };
    }
  }, options);
}

async function fixtureCounters(page: Page) {
  return page.evaluate(() => {
    const fixture = (window as unknown as { mironVoiceFixture: VoiceFixture }).mironVoiceFixture;
    return {
      starts: fixture.starts,
      stops: fixture.stops,
      trackStops: fixture.trackStops,
      transcriptions: fixture.transcriptions,
      constructors: fixture.constructors,
      probes: fixture.probes,
    };
  });
}

async function openPreview(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "miron:story-preview:v2",
      JSON.stringify({
        flowVersion: 3,
        step: 6,
        companion: "max",
        interests: [],
        locations: [],
        completed: true,
      }),
    ),
  );
  await page.goto("/story/home");
  await expect(page.getByRole("main")).toHaveAttribute("data-persona", "max");
}

function operationId(route: Route) {
  const value = route
    .request()
    .postData()
    ?.match(/name="operationId"\r\n\r\n([^\r]+)\r\n/)?.[1];
  if (!value) throw new Error("Missing operationId in voice multipart fixture request.");
  return value;
}

async function mockVoiceApi(page: Page, text = "хочу спокойно потренироваться") {
  const sessions: unknown[] = [];
  const uploads: string[] = [];
  await page.route("**/api/voice/session", async (route) => {
    sessions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ready: true } });
  });
  await page.route("**/api/voice/transcribe", async (route) => {
    uploads.push(route.request().postData() ?? "");
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
    await route.fulfill({
      json: {
        operationId: operationId(route),
        text,
        provider: "local",
        model: "fixture",
        durationMs: 1000,
      },
    });
  });
  return { sessions, uploads };
}

const microphone = (page: Page) =>
  page.getByRole("button", { name: "Начать голосовой ввод", exact: true });
const stop = (page: Page) =>
  page.getByRole("button", { name: "Остановить голосовой ввод", exact: true });
const cancel = (page: Page) =>
  page.getByRole("button", { name: "Отменить голосовой ввод", exact: true });
const draft = (page: Page) =>
  page.getByRole("textbox", { name: "Сообщение напарнику", exact: true });

test("stop uploads one complete recording including its final chunk and appends editable text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installRecorder(page);
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Мой черновик.");
  await microphone(page).click();
  await expect(stop(page)).toBeVisible();
  await expect(draft(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled();
  await expect(page.getByLabel("Длительность записи")).toContainText("/ 1:00");
  await page.screenshot({ path: ".local/previews/voice-recording-mobile.png", fullPage: true });
  expect(api.uploads).toHaveLength(0);
  await stop(page).click();
  await expect(draft(page)).toHaveValue("Мой черновик. хочу спокойно потренироваться");
  await expect(draft(page)).toBeEnabled();
  expect(api.sessions).toEqual([{ preview: true }]);
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toContain("initial-final");
  expect(api.uploads[0]).toContain('name="audio"; filename="voice.webm"');
  expect(api.uploads[0]).toContain('name="companion"\r\n\r\nmax');
  expect(api.uploads[0]).toMatch(/name="recordingMs"\r\n\r\n[1-9]\d*/);
  expect((await fixtureCounters(page)).trackStops).toBe(1);
  await expect(
    page.getByText("Текст добавлен в черновик. Проверь его перед отправкой."),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/previews/voice-transcript-mobile.png", fullPage: true });
});

test("cancel during processing ignores even a transport that returns a late transcript", async ({
  page,
}) => {
  await installRecorder(page, { lateResponse: true });
  await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Сохранённый черновик.");
  await microphone(page).click();
  await stop(page).click();
  await expect.poll(async () => (await fixtureCounters(page)).transcriptions).toBe(1);
  await cancel(page).click();
  await draft(page).fill("Исправленный черновик.");
  await page.evaluate(() =>
    (
      window as unknown as { mironVoiceFixture: VoiceFixture }
    ).mironVoiceFixture.resolveTranscript(),
  );
  await expect(microphone(page)).toBeEnabled();
  await expect(draft(page)).toHaveValue("Исправленный черновик.");
});

test("denied microphone permission leaves the draft editable without API requests", async ({
  page,
}) => {
  await installRecorder(page, { deny: true });
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Набранный текст.");
  await microphone(page).click();
  await expect(page.locator("p[role=alert]")).toHaveText(
    "Разреши доступ к микрофону в настройках браузера.",
  );
  await expect(draft(page)).toBeEnabled();
  await expect(draft(page)).toHaveValue("Набранный текст.");
  expect(api.sessions).toHaveLength(0);
  expect(api.uploads).toHaveLength(0);
});

test("offline cancels recording, ignores late chunks and never restarts on reconnect", async ({
  page,
  context,
}) => {
  await installRecorder(page);
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Мой черновик.");
  await microphone(page).click();
  await expect(stop(page)).toBeVisible();
  await context.setOffline(true);
  await expect(microphone(page)).toBeDisabled();
  await expect(page.locator("#dashboard-voice-offline")).toHaveText(
    "Голосовой ввод доступен с интернетом. Пока можно вводить текст.",
  );
  await draft(page).fill("Черновик исправлен офлайн.");
  await context.setOffline(false);
  await page.evaluate(() =>
    (window as unknown as { mironVoiceFixture: VoiceFixture }).mironVoiceFixture.lateChunk(),
  );
  await expect(microphone(page)).toBeEnabled();
  await expect(draft(page)).toHaveValue("Черновик исправлен офлайн.");
  expect(await fixtureCounters(page)).toMatchObject({ starts: 1, stops: 1, trackStops: 1 });
  expect(api.sessions).toHaveLength(0);
  expect(api.uploads).toHaveLength(0);
});

test("cancel while permission is pending stops the late stream without starting a recorder", async ({
  page,
}) => {
  await installRecorder(page, { pendingPermission: true });
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await microphone(page).click();
  await expect(cancel(page)).toBeVisible();
  await cancel(page).click();
  await page.evaluate(() =>
    (
      window as unknown as { mironVoiceFixture: VoiceFixture }
    ).mironVoiceFixture.resolvePermission(),
  );
  await expect.poll(async () => (await fixtureCounters(page)).trackStops).toBe(1);
  expect((await fixtureCounters(page)).starts).toBe(0);
  expect(api.uploads).toHaveLength(0);
});

test("runtime codec failure retries with the browser default and preserves its MIME type", async ({
  page,
}) => {
  await installRecorder(page, { failPreferred: true });
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await microphone(page).click();
  await stop(page).click();
  await expect(draft(page)).toHaveValue("хочу спокойно потренироваться");
  expect(await fixtureCounters(page)).toMatchObject({
    constructors: ["audio/webm;codecs=opus", "browser-default"],
    probes: ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"],
  });
  expect(api.uploads[0]).toContain('name="audio"; filename="voice.mp4"');
  expect(api.uploads[0]).toContain("Content-Type: audio/mp4");
});

for (const interruption of ["pause", "ended", "pagehide", "hidden"] as const) {
  test(`${interruption} interrupts recording and releases audio without upload`, async ({
    page,
  }) => {
    await installRecorder(page);
    const api = await mockVoiceApi(page);
    await openPreview(page);
    await draft(page).fill("Черновик остаётся.");
    await microphone(page).click();
    await expect(stop(page)).toBeVisible();
    await page.evaluate((event) => {
      if (event === "pause" || event === "ended")
        (window as unknown as { mironVoiceFixture: VoiceFixture }).mironVoiceFixture.interrupt(
          event,
        );
      else if (event === "pagehide") window.dispatchEvent(new Event("pagehide"));
      else {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      }
    }, interruption);
    await expect(microphone(page)).toBeVisible();
    await expect(draft(page)).toBeEnabled();
    await expect(draft(page)).toHaveValue("Черновик остаётся.");
    expect((await fixtureCounters(page)).trackStops).toBe(1);
    expect(api.uploads).toHaveLength(0);
  });
}

test("recording over 5 MiB is discarded locally before either API request", async ({ page }) => {
  await installRecorder(page);
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await microphone(page).click();
  await expect(stop(page)).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { mironVoiceFixture: VoiceFixture }).mironVoiceFixture.emitBytes(
      5 * 1024 * 1024,
    ),
  );
  await expect(page.locator("p[role=alert]")).toContainText("Запись превышает 5 МБ");
  expect((await fixtureCounters(page)).trackStops).toBe(1);
  expect(api.sessions).toHaveLength(0);
  expect(api.uploads).toHaveLength(0);
});

test("wall-clock limit automatically stops at sixty seconds", async ({ page }) => {
  await page.clock.install();
  await installRecorder(page);
  const api = await mockVoiceApi(page);
  await openPreview(page);
  await microphone(page).click();
  await expect(stop(page)).toBeVisible();
  await page.clock.fastForward(60_000);
  await page.clock.runFor(50);
  await expect(draft(page)).toHaveValue("хочу спокойно потренироваться");
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toMatch(/name="recordingMs"\r\n\r\n60\d{3}/);
  expect((await fixtureCounters(page)).trackStops).toBe(1);
});

test("transcript that would exceed the text limit is offered without truncating an existing draft", async ({
  page,
}) => {
  await installRecorder(page);
  await mockVoiceApi(page, "Новая расшифровка.");
  await openPreview(page);
  const original = "я".repeat(1995);
  await draft(page).fill(original);
  await microphone(page).click();
  await stop(page).click();
  await expect(page.getByLabel("Сохранённая расшифровка")).toHaveValue("Новая расшифровка.");
  await expect(draft(page)).toHaveValue(original);
  await expect(page.getByText(/В сообщении можно написать до 2000 символов/)).toBeVisible();
  await draft(page).fill("Укороченный черновик.");
  await page.getByRole("button", { name: "Добавить в черновик" }).click();
  await expect(draft(page)).toHaveValue("Укороченный черновик. Новая расшифровка.");
});

test("session authorization failure is shown honestly and prevents audio upload", async ({
  page,
}) => {
  await installRecorder(page);
  let uploads = 0;
  await page.route("**/api/voice/session", (route) =>
    route.fulfill({
      status: 403,
      json: { error: { message: "Войди в аккаунт для голосового ввода." } },
    }),
  );
  await page.route("**/api/voice/transcribe", (route) => {
    uploads++;
    return route.fulfill({ status: 500 });
  });
  await openPreview(page);
  await draft(page).fill("Мой текст.");
  await microphone(page).click();
  await stop(page).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Войди в аккаунт для голосового ввода.");
  await expect(draft(page)).toHaveValue("Мой текст.");
  expect(uploads).toBe(0);
});

test("changing coach cancels processing and cannot append the old coach transcript", async ({
  page,
}) => {
  await installRecorder(page, { lateResponse: true });
  await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Черновик Максу.");
  await microphone(page).click();
  await stop(page).click();
  await expect.poll(async () => (await fixtureCounters(page)).transcriptions).toBe(1);
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("button", { name: /^Напарники · сейчас/ }).click();
  await page.getByRole("button", { name: /^Лика Внимательная/ }).click();
  await page.getByRole("button", { name: "Закрыть панель", exact: true }).click();
  await draft(page).fill("Черновик Лике.");
  await page.evaluate(() =>
    (
      window as unknown as { mironVoiceFixture: VoiceFixture }
    ).mironVoiceFixture.resolveTranscript(),
  );
  await expect(draft(page)).toHaveValue("Черновик Лике.");
  await expect(microphone(page)).toBeEnabled();
});

test("offline processing cancellation ignores a late response after reconnect", async ({
  page,
  context,
}) => {
  await installRecorder(page, { lateResponse: true });
  await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Исходный черновик.");
  await microphone(page).click();
  await stop(page).click();
  await expect.poll(async () => (await fixtureCounters(page)).transcriptions).toBe(1);
  await context.setOffline(true);
  await expect(microphone(page)).toBeDisabled();
  await draft(page).fill("Текст исправлен без сети.");
  await context.setOffline(false);
  await page.evaluate(() =>
    (
      window as unknown as { mironVoiceFixture: VoiceFixture }
    ).mironVoiceFixture.resolveTranscript(),
  );
  await expect(microphone(page)).toBeEnabled();
  await expect(draft(page)).toHaveValue("Текст исправлен без сети.");
  expect((await fixtureCounters(page)).starts).toBe(1);
});

test("processing deadline cancels a stalled request and rejects its late result", async ({
  page,
}) => {
  await page.clock.install();
  await installRecorder(page, { lateResponse: true });
  await mockVoiceApi(page);
  await openPreview(page);
  await draft(page).fill("Мой текст.");
  await microphone(page).click();
  await stop(page).click();
  await page.clock.runFor(50);
  await expect.poll(async () => (await fixtureCounters(page)).transcriptions).toBe(1);
  await page.clock.fastForward(100_000);
  await expect(page.locator("p[role=alert]")).toContainText("Распознавание заняло слишком долго");
  await expect(draft(page)).toBeEnabled();
  await page.evaluate(() =>
    (
      window as unknown as { mironVoiceFixture: VoiceFixture }
    ).mironVoiceFixture.resolveTranscript(),
  );
  await expect(draft(page)).toHaveValue("Мой текст.");
});

test("the existing demo chat uses the same editable voice draft without sending a message", async ({
  page,
}) => {
  await installRecorder(page);
  const api = await mockVoiceApi(page, "Расшифровка для Макса.");
  await page.goto("/demo?legacy=1");
  await page.getByLabel("Как тебя зовут?").fill("Олег");
  for (let step = 0; step < 4; step++)
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("checkbox", { name: /Мне исполнилось 18 лет/ }).check();
  await page.getByRole("button", { name: "Начать свой путь" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/chat");
  await draft(page).fill("Уже набрано.");
  await microphone(page).click();
  await stop(page).click();
  await expect(draft(page)).toHaveValue("Уже набрано. Расшифровка для Макса.");
  expect(api.sessions).toEqual([{ preview: true }]);
  await expect(page.getByRole("log", { name: "Разговор с напарником" })).not.toContainText(
    "Расшифровка для Макса.",
  );
  await expect(draft(page)).toBeEnabled();
});
