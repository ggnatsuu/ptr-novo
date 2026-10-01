// Gera os dados do jogo usados pelo cálculo das colunas pesadas, a partir
// do download do Hakuraku. Rodar de novo quando o jogo ganhar skills/pistas novas.
import fs from 'fs'; import zlib from 'zlib';
const B = 'C:/Users/Felipe Alves/Documents/Meus Projetos/';
const D = B + 'ptr-novo/src/utils/hakuraku/dados/';
const U = JSON.parse(fs.readFileSync(B + 'hakuraku-main/public/data/umdb.json'));
const G = JSON.parse(zlib.gunzipSync(fs.readFileSync(B + 'hakuraku-main/public/data/gamedata.bin.gz')));
const { bancoCorridas, bancoG1 } = await import('file:///' + B + 'ptr-novo/src/data/bancos-corridas.js');
const w = (n, o) => { fs.writeFileSync(D + n, JSON.stringify(o)); console.log(n, (fs.statSync(D + n).size / 1024).toFixed(0) + 'KB'); };
w('skills.json', U.skill);
w('charas.json', U.chara.map(c => ({ id: c.id, name: c.name })));
w('skillNeedPoints.json', Object.fromEntries(U.singleModeSkillNeedPoint.map(e => [e.id, e.needSkillPoint])));
// Traçados de TODAS as pistas do jogo (não só as da PTR): a ferramenta Replay
// de Corrida aceita arquivos de qualquer corrida, e o WT precisa do traçado.
const ids = new Set([...bancoCorridas, ...bancoG1].map(p => String(p.courseId)));
const shapes = G['tracks/course_shapes'];
const ratios = G['tracks/course_base_ratios'];
console.log('formas de pista', Object.keys(shapes).length, '(PTR usa', ids.size + ')');
w('pistas.json', { courseData: G['tracks/course_data'], racetracks: G['tracks/racetracks'], courseShapes: shapes, courseBaseRatios: ratios });
