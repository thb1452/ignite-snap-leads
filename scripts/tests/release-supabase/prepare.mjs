import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import ts from 'typescript';

export const copiedFunctions = Object.freeze(['create-checkout-session/index.ts','test-pipeline/index.ts','_shared/internalWorkerAuth.ts','_shared/stripeMode.ts','_shared/stripeSubscriptionPlan.ts','_shared/checkoutCatalog.ts']);

// Inspect copied bytes, not the repository: a dependency present only in the
// source checkout cannot make the isolated fixture complete. Never fetch imports.
export async function assertRelativeImportClosure(root,entries=copiedFunctions){
  const pending=[...entries],visited=new Set();
  while(pending.length){
    const path=pending.pop();
    if(visited.has(path))continue;
    const absolute=resolve(root,path),within=relative(resolve(root),absolute);
    assert.ok(within&&!within.startsWith(`..${sep}`)&&within!=='..'&&!within.startsWith(sep),'Function import must remain inside copied functions');
    let source;
    try{source=await readFile(absolute,'utf8');}catch{throw new Error(`Copied function dependency missing: ${within}`);}
    visited.add(path);
    const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
    const imports=[];
    function visit(node){
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)imports.push(node.moduleSpecifier);
      if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))imports.push(node.argument.literal);
      if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)&&node.moduleReference.expression)imports.push(node.moduleReference.expression);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
        assert.ok(node.arguments.length&&ts.isStringLiteralLike(node.arguments[0]),'Computed imports require an explicit fixture dependency review');
        imports.push(node.arguments[0]);
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
    for(const specifier of imports){
      assert.ok(ts.isStringLiteralLike(specifier),'Unsupported fixture import');
      if(specifier.text.startsWith('.'))pending.push(relative(resolve(root),resolve(absolute,'..',specifier.text)));
    }
  }
  return [...visited].sort();
}

// Copy only selected unchanged handlers and non-secret configuration. Never copy
// repository .env, hosted project links, migrations, seeds or provider credentials.
export async function prepareStack(targetArgument){
const target=resolve(targetArgument??'');
assert.ok(targetArgument&&target.endsWith('/snap-release-ci'),'Dedicated target directory required');
assert.ok(target.startsWith('/tmp/')||target.startsWith(`${process.env.RUNNER_TEMP}/`),'Temporary CI target required');
await assert.rejects(access(join(target,'supabase')),'Refusing to reuse an initialized stack');
await mkdir(join(target,'supabase/functions/_shared'),{recursive:true});
const source=new URL('../../../',import.meta.url);
const original=await readFile(new URL('supabase/config.toml',source),'utf8');
for(const [name,expected] of [['create-checkout-session','true'],['test-pipeline','false']]){
  const section=original.match(new RegExp(`\\[functions\\.${name}\\]([^\\[]*)`))?.[1];
  assert.match(section??'',new RegExp(`verify_jwt\\s*=\\s*${expected}\\b`),'Candidate gateway configuration changed; review CI mapping');
}
await copyFile(new URL('./config.toml',import.meta.url),join(target,'supabase/config.toml'));
for(const path of copiedFunctions){
  const destination=join(target,'supabase/functions',path);
  await mkdir(resolve(destination,'..'),{recursive:true});
  await copyFile(new URL(`supabase/functions/${path}`,source),destination);
}
await assertRelativeImportClosure(join(target,'supabase/functions'));
await writeFile(join(target,'functions.env'),[
  'STRIPE_EXPECTED_LIVEMODE=false',
  'STRIPE_SECRET_KEY=sk_test_synthetic_local_only_not_a_credential',
  `INTERNAL_FUNCTION_SECRET=${randomBytes(32).toString('hex')}`,
  'APP_URL=http://127.0.0.1:3000','',
].join('\n'),{mode:0o600});
console.log('Prepared dedicated synthetic Supabase stack; no hosted configuration copied.');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareStack(process.argv[2]);
