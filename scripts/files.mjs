export const runtimeFiles = ['index.html','src/app.js','src/domain.js','src/catalog.js','src/styles.css'];
export const dataNames = ['catalog','texts','import-report', ...Array.from({length:16},(_,i)=>'details-'+i.toString(16))];
export const publicFiles = ['favicon.svg',...dataNames.flatMap(n=>['data/'+n+'.json','data/'+n+'.json.gz']), 'data/foph-sl-publication-20261001-de.xlsx','data/foph-sl-publication-20261001-de.ndjson.gz'];
export const artifactFiles = [...runtimeFiles,...publicFiles,'.nojekyll'];
