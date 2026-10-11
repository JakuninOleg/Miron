const fs = require('fs');
const path = require('path');
const sharp = require('C:/Users/olegk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir = __dirname;
const colors = {white:'#F8F7F5',ink:'#17181B',pink:'#F27EA8',fold:'#C6507B'};
function mark(light=false, mono=null) {
  const a=mono || (light?colors.ink:colors.white), b=mono || colors.pink;
  return `<g>
  <path fill="${a}" d="M42 184V77C42 54 65 44 82 60L163 135L139 151L75 99V184Q75 192 67 192H50Q42 192 42 184Z"/>
  <path fill="${b}" d="M127 146L151 123L222 60C236 47 250 47 259 59L164 150C151 164 139 158 127 146Z"/>
  <path fill="${b}" d="M234 91L267 60V184Q267 192 259 192H242Q234 192 234 184Z"/>
  ${mono?'':`<path fill="${colors.fold}" d="M127 146L151 123L164 135L151 148Q140 157 127 146Z"/>`}
  </g>`;
}
function word(color,id='o-cut') {
 return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="320" y="0" width="105" height="100"><rect x="320" width="105" height="100" fill="white"/><path d="M330 89L416 3" stroke="black" stroke-width="9"/></mask></defs>
 <g fill="none" stroke="${color}" stroke-width="11" stroke-linecap="butt" stroke-linejoin="miter">
 <path stroke="none" fill="${color}" d="M16 85V9H25L59 41L93 9H102V85H91V26L59 56L27 26V85Z"/>
 <path d="M158 9V85"/>
 <path d="M218 9H260C287 9 287 47 260 47H239L270 81"/>
 <circle cx="373" cy="47" r="38" mask="url(#${id})"/>
 <path stroke="none" fill="${color}" d="M465 85V9H476L534 68V9H545V85H534L476 26V85Z"/>
 </g>`;
}
const svg=(view,body,title)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
const assets={
 'miron-mark-dark':svg('24 36 261 175',mark(false),'MIRON — бело-розовый знак M для тёмного фона'),
 'miron-mark-light':svg('24 36 261 175',mark(true),'MIRON — графитово-розовый знак M для светлого фона'),
 'miron-mark-mono-dark':svg('24 36 261 175',mark(false,colors.ink),'MIRON — одноцветный знак M'),
 'miron-mark-mono-light':svg('24 36 261 175',mark(false,colors.white),'MIRON — белый знак M'),
 'miron-wordmark-dark':svg('0 0 563 98',word(colors.white),'MIRON — словесный логотип для тёмного фона'),
 'miron-wordmark-light':svg('0 0 563 98',word(colors.ink),'MIRON — словесный логотип для светлого фона'),
 'miron-lockup-dark':svg('0 0 930 240',mark(false)+`<g transform="translate(332 74) scale(1.02)">${word(colors.white)}</g>`,'MIRON — знак и название'),
 'miron-app-icon':svg('0 0 512 512',`<rect width="512" height="512" fill="${colors.ink}"/><g transform="translate(36 80) scale(1.42)">${mark(false)}</g>`,'MIRON — иконка приложения')
};
const preview=svg('0 0 1600 1120',`
<rect width="1600" height="720" fill="${colors.ink}"/>
<rect y="720" width="1600" height="400" fill="${colors.white}"/>
<g transform="translate(650 42) scale(1.25)">${mark(false)}</g>
<g transform="translate(330 360) scale(1.67)">${word(colors.white,'o-main')}</g>
<g fill="${colors.white}" font-family="Arial, sans-serif" font-size="19" letter-spacing="3"><text x="70" y="66">MIRON / ЛОГОТИП</text><text x="70" y="668">ЗНАК M</text><text x="740" y="668">СЛОВЕСНЫЙ ЛОГОТИП</text></g>
<g transform="translate(160 751) scale(.9)">${mark(true)}</g>
<g transform="translate(76 960) scale(.72)">${word(colors.ink,'o-light')}</g>
<rect x="600" y="780" width="210" height="210" rx="44" fill="${colors.ink}"/>
<g transform="translate(604 794) scale(.65)">${mark(false)}</g>
<rect x="900" y="780" width="210" height="210" rx="44" fill="${colors.pink}"/>
<g transform="translate(904 794) scale(.65)">${mark(false,colors.ink)}</g>
<g transform="translate(1220 790) scale(.85)">${mark(false,colors.ink)}</g>
<g fill="${colors.ink}" font-family="Arial, sans-serif" font-size="17"><text x="105" y="1068">Светлый фон</text><text x="608" y="1068">Иконка приложения</text><text x="927" y="1068">Одноцветный знак</text><text x="1260" y="1068">Монохром</text></g>
`,'MIRON — предпросмотр логотипа v1');
async function build() {
 for(const [name,content] of Object.entries(assets)) {
  fs.writeFileSync(path.join(dir,name+'.svg'),content);
  await sharp(Buffer.from(content)).resize(name==='miron-app-icon'?512:1200).png().toFile(path.join(dir,name+'.png'));
 }
 fs.writeFileSync(path.join(dir,'logo-preview.svg'),preview);
 await sharp(Buffer.from(preview)).png().toFile(path.join(dir,'logo-preview.png'));
 for(const size of [16,32,64,192]) await sharp(Buffer.from(assets['miron-app-icon'])).resize(size,size).png().toFile(path.join(dir,`app-icon-${size}.png`));
 console.log('Built separate vector wordmark, M marks, lockup, app icon and PNG previews.');
}
build().catch(e=>{console.error(e);process.exit(1);});
