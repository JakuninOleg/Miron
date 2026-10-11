import { useId } from "react";
import type { EquipmentArt as Art } from "@/shared/workout-inventory";

/** Original vector illustrations: the pair variants share the same equipment geometry. */
export function EquipmentArt({ art, paired = false }: { art: Art; paired?: boolean }) {
  const id = useId().replaceAll(":", "");
  const metal = `url(#${id}-metal)`;
  const accent = `url(#${id}-accent)`;
  const dark = "#253338";
  function dumbbell(x: number, y: number, scale = 1) {
    return (
      <g transform={`translate(${x} ${y}) rotate(-22) scale(${scale})`}>
        <rect x="-39" y="-7" width="78" height="14" rx="5" fill={metal} />
        <path d="M-12-7v14M-6-7v14M0-7v14M6-7v14M12-7v14" stroke="#809198" strokeWidth="1.5" />
        {[-43, 28].map((left) => (
          <g key={left}>
            <path d={`M${left}-21 l8-5 14 5v42l-14 5-8-5z`} fill={dark} />
            <path d={`M${left + 8}-26v52l14-5v-42z`} fill={metal} />
            <path d={`M${left + 11}-18v36`} stroke="currentColor" strokeWidth="3" />
          </g>
        ))}
      </g>
    );
  }
  function kettlebell(x: number, y: number, scale = 1) {
    return (
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <path d="M-22-14c-7-31 51-31 44 0" fill="none" stroke={dark} strokeWidth="12" />
        <path d="M-22-16c-5-23 49-23 44 0" fill="none" stroke="#829095" strokeWidth="3" />
        <path d="M-23-17c-24 16-22 47-6 56h58c16-9 18-40-6-56z" fill={metal} />
        <path d="M-29 5q-7 13-2 22" fill="none" stroke="currentColor" strokeWidth="5" />
      </g>
    );
  }
  let drawing;
  switch (art) {
    case "dumbbell":
      drawing = paired ? (
        <>
          {dumbbell(72, 74, 0.78)}
          {dumbbell(141, 58, 0.78)}
        </>
      ) : (
        dumbbell(110, 68, 1.14)
      );
      break;
    case "kettlebell":
      drawing = paired ? (
        <>
          {kettlebell(80, 61, 0.78)}
          {kettlebell(146, 67, 0.88)}
        </>
      ) : (
        kettlebell(112, 64, 1.02)
      );
      break;
    case "barbell":
      drawing = (
        <g transform="translate(112 64) rotate(-12)">
          <rect x="-94" y="-4" width="188" height="8" rx="3" fill={metal} />
          {[-65, 49].map((x) => (
            <g key={x}>
              <rect x={x} y="-29" width="17" height="58" rx="5" fill={dark} />
              <rect x={x + 3} y="-25" width="7" height="50" rx="3" fill={accent} />
              <rect x={x - 9} y="-21" width="9" height="42" rx="3" fill={metal} />
            </g>
          ))}
        </g>
      );
      break;
    case "band":
      drawing = (
        <g transform="rotate(-18 110 65)">
          <ellipse cx="93" cy="63" rx="44" ry="28" fill="none" stroke={accent} strokeWidth="12" />
          <ellipse cx="134" cy="71" rx="32" ry="21" fill="none" stroke="#617780" strokeWidth="9" />
          <path d="M63 46q20-11 41-4" fill="none" stroke="#ffe8dd" strokeWidth="2" />
        </g>
      );
      break;
    case "bench":
      drawing = (
        <>
          <path d="M65 66l-12 35m76-32 29 33M47 103h26m71 1h28" stroke={dark} strokeWidth="9" />
          <path d="M41 51l94-17 49 25-94 18z" fill={accent} />
          <path d="M41 51v13l49 27 94-20V59L90 77z" fill={dark} />
          <path d="M53 51l78-13" stroke="#ffdfcf" strokeWidth="2" />
        </>
      );
      break;
    case "mat":
      drawing = (
        <>
          <path d="M43 78l107-45 46 34-101 48z" fill={accent} />
          <path d="M43 78l52 37v-9L48 74z" fill="#ad5063" />
          <path
            d="M53 78l98-41m-80 52 97-41m-77 55 94-43"
            stroke="#fff"
            strokeOpacity=".25"
            strokeWidth="2"
          />
          <ellipse cx="66" cy="65" rx="27" ry="14" transform="rotate(32 66 65)" fill={accent} />
          <path d="M45 50q-13 9 13 25 27 17 34 5" fill="none" stroke="#aa4f65" strokeWidth="5" />
          <path d="M58 59q-8 1 3 9 11 7 14 2" fill="none" stroke="#ffe5df" strokeWidth="3" />
        </>
      );
      break;
    case "block":
      drawing = (
        <>
          {["translate(47 40)", "translate(118 54)"].map((transform) => (
            <g transform={transform} key={transform}>
              <path d="M0 14L39 0l28 20-39 15z" fill="#ffdfcf" />
              <path d="M0 14v40l28 20V35z" fill={accent} />
              <path d="M28 35v39l39-16V20z" fill="#b36371" />
              <path d="M7 24v24" stroke="#ffd8cc" strokeWidth="2" />
            </g>
          ))}
        </>
      );
      break;
    case "strap":
      drawing = (
        <>
          <path
            d="M58 70c-34-45 100-54 108-22s-116 46-92 57 93-2 114-9"
            fill="none"
            stroke={accent}
            strokeWidth="12"
          />
          <path d="M61 68c-29-36 93-47 101-19" fill="none" stroke="#ffe1d6" strokeWidth="2" />
          <rect
            x="50"
            y="62"
            width="25"
            height="18"
            rx="4"
            transform="rotate(-15 50 62)"
            fill="none"
            stroke="#677a81"
            strokeWidth="6"
          />
        </>
      );
      break;
    case "bolster":
      drawing = (
        <g transform="rotate(-20 110 70)">
          <rect x="54" y="46" width="116" height="43" rx="22" fill={accent} />
          <ellipse cx="67" cy="67" rx="16" ry="21" fill="#be6a7a" />
          <ellipse cx="67" cy="67" rx="9" ry="14" fill="none" stroke="#f8bac7" strokeWidth="2" />
          <path d="M89 51h57" stroke="#ffdfdf" strokeWidth="2" />
        </g>
      );
      break;
    case "blanket":
      drawing = (
        <>
          <path d="M48 53l91-16 45 24-92 20z" fill="#ffe0dc" />
          <path d="M48 53v38l44 23 92-19V61L92 81z" fill={accent} />
          <path d="M52 76l40 23 86-18M92 83v28" fill="none" stroke="#a75970" strokeWidth="3" />
        </>
      );
      break;
    case "roller":
      drawing = (
        <g transform="rotate(-22 110 65)">
          <rect x="53" y="44" width="121" height="44" fill={accent} />
          <ellipse cx="174" cy="66" rx="15" ry="22" fill="#ab586f" />
          <ellipse cx="53" cy="66" rx="15" ry="22" fill="#ffd0cb" />
          <ellipse cx="53" cy="66" rx="7" ry="12" fill={dark} />
          <path
            d="M75 44v44m18-44v44m18-44v44m18-44v44m18-44v44"
            stroke="#be6978"
            strokeWidth="4"
          />
        </g>
      );
      break;
    case "rings":
      drawing = (
        <>
          <path d="M72 17v44m78-44v44" stroke={dark} strokeWidth="10" />
          <path d="M72 17v42m78-42v42" stroke={accent} strokeWidth="3" />
          {[72, 150].map((x) => (
            <circle key={x} cx={x} cy="82" r="24" fill="none" stroke="#c8a57c" strokeWidth="9" />
          ))}
        </>
      );
      break;
    case "pullup":
      drawing = (
        <>
          <path
            d="M38 39h148m-132 0v16m116-16v16"
            stroke={metal}
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path d="M54 39h32m50 0h33" stroke={dark} strokeWidth="15" />
          <path d="M48 25v27m128-27v27" stroke={accent} strokeWidth="7" />
        </>
      );
      break;
    case "parallettes":
      drawing = (
        <>
          {["translate(42 59)", "translate(114 40)"].map((transform) => (
            <g key={transform} transform={transform}>
              <path
                d="M0 32V12h56v20M-12 35h24m32 0h24"
                fill="none"
                stroke={metal}
                strokeWidth="9"
              />
              <path d="M6 12h44" stroke={accent} strokeWidth="12" />
            </g>
          ))}
        </>
      );
      break;
    case "vest":
      drawing = (
        <>
          <path d="M82 23l-17 8-11 28 15 6v44h89V65l15-6-11-28-17-8-15 15h-33z" fill={dark} />
          <path d="M88 27l13 17h25l14-17M111 45v58" fill="none" stroke={accent} strokeWidth="5" />
          {[78, 127].flatMap((x) =>
            [52, 78].map((y) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="26" height="19" rx="3" fill={metal} />
            )),
          )}
        </>
      );
      break;
    case "belt":
      drawing = (
        <>
          <path d="M48 53q58-37 118 0v27q-58-31-118 0z" fill={dark} />
          <path d="M53 55q58-29 108 0" fill="none" stroke={accent} strokeWidth="6" />
          <path
            d="M66 77q44 64 90 0"
            fill="none"
            stroke="#9faeb1"
            strokeWidth="6"
            strokeDasharray="6 4"
          />
          <rect
            x="142"
            y="51"
            width="25"
            height="22"
            rx="4"
            fill="none"
            stroke={metal}
            strokeWidth="5"
          />
        </>
      );
      break;
    case "backpack":
      drawing = (
        <>
          <path d="M86 36v-9q24-24 48 0v9" fill="none" stroke={dark} strokeWidth="8" />
          <rect x="64" y="32" width="94" height="78" rx="23" fill={dark} />
          <path d="M73 47q38-11 76 0" fill="none" stroke={accent} strokeWidth="7" />
          <rect x="80" y="66" width="63" height="36" rx="10" fill={metal} />
          <path d="M88 74h46" stroke="#a5b3b7" strokeWidth="2" />
        </>
      );
      break;
  }
  return (
    <svg viewBox="0 0 224 132" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#a7b5b8" />
          <stop offset=".45" stopColor="#53666e" />
          <stop offset="1" stopColor="#293e47" />
        </linearGradient>
        <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".65" />
        </linearGradient>
      </defs>
      <ellipse cx="112" cy="113" rx="77" ry="7" fill="#101a1e" opacity=".12" />
      <g stroke="#101a1e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        {drawing}
      </g>
    </svg>
  );
}
