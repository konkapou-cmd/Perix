const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('the 17 public-service categories and 5 job types have audited caption-free local artwork',()=>{
  const base=path.join(root,'assets/illustrations/civic-jobs-v1');
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
  assert.equal(manifest.icons.length,22);
  for(const row of manifest.icons){
    const data=fs.readFileSync(path.join(base,row.file));
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),row.sha256);
    assert.ok(row.size[0]>30&&row.size[1]>30);
  }
  const taxonomy=JSON.parse(read('../backend/public_services/taxonomy.json'));
  const ids=new Set(manifest.icons.filter(row=>row.sheet==='public').map(row=>row.id.replace('ps-sos','ps:sos')));
  for(const node of taxonomy.children)assert.ok(ids.has(node.id),node.id);
  assert.deepEqual(manifest.icons.filter(row=>row.sheet==='jobs').map(row=>row.id),['Vollzeit','Teilzeit','Vertrag','Praktikum','Remote']);
});
test('icon registry uses the supplied job/civic art and reuses actual existing mobility and property images',()=>{
  const output={};
  vm.runInNewContext(ts.transpileModule(read('lib/civicIllustrations.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:output,require:name=>{
      if(name==='./mobilityViewSources.generated')return{MOBILITY_VIEW_SOURCES:{bus:{0:'bus'},tram:{0:'tram'},bus_stop:{0:'stop'},
        subway:{0:'subway'},"s-bahn":{0:'s-bahn'},rail:{0:'rail'},ferry:{0:'ferry'}}};
      const file=path.resolve(root,'lib',name);assert.ok(fs.existsSync(file),file);return file;
    }});
  for(const key of ['Vollzeit','Teilzeit','Vertrag','Praktikum','Remote'])assert.ok(output.JOB_ILLUSTRATIONS[key].includes('civic-jobs-v1'));
  for(const key of ['apartment','house','studio','room','commercial'])assert.ok(output.PROPERTY_ILLUSTRATIONS[key]);
  for(const key of ['bus','tram','taxi','stop'])assert.ok(output.MOBILITY_CATEGORY_ILLUSTRATIONS[key]);
  const gateway=read('components/city/CityGatewayScreen.tsx');
  assert.match(gateway,/kind:"public-service",key:node\.query\.publicCategory/);
  assert.match(gateway,/kind:"job-type",key:node\.query\.job_type/);
  assert.match(gateway,/\["hotels","homes-nearby","rentals","mobility"\]\.includes\(node\.id\)/);
});
