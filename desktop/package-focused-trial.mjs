// Produce a local candidate without downloading dependencies or compiling native code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),[binary,output]=process.argv.slice(2);
if(!binary||!output)throw Error('Usage: node desktop/package-focused-trial.mjs <beta0.9.5-engine.exe> <new-output-directory>');
const destination=path.resolve(output);if(fs.existsSync(destination))throw Error('Use a new output directory; existing output is never overwritten');
const hash=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');if(hash!=='f7ef69a8ed04a516e7620c45ee315d61d898faeab3520860b243746d0fded5fb')throw Error('Unexpected engine hash');
fs.mkdirSync(destination,{recursive:true});
for(const relative of ['index.html','assets','trial-preview.mjs','electron/sidecar.mjs','electron/listen-url.mjs']){const target=path.join(destination,'desktop',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(root,relative),target,{recursive:true})}
fs.copyFileSync(binary,path.join(destination,'szudesktop-engine.exe'));
for(const relative of ['LICENSE','THIRD_PARTY_NOTICES.md','docs/guide/focused-trial.md','docs/guide/focused-trial-feedback.csv']){const target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,'..',relative),target)}
fs.writeFileSync(path.join(destination,'START.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nnode desktop\\trial-preview.mjs szudesktop-engine.exe trial-data\r\npause\r\n');
fs.writeFileSync(path.join(destination,'README.txt'),'szuDesktop focused browser trial — unpublished\r\nRequires existing Node.js 22+ and Windows x64. No dependencies to install.\r\nRun START.cmd; open the local Trial preview link printed in the console.\r\nOnly pets and local course notes are enabled. No school accounts or OS permissions.\r\nData is isolated in trial-data beside START.cmd. Reuse the same folder for seven days.\r\nWait for the saved indicator before exiting. Export notes before deleting the folder.\r\nSee docs/guide/focused-trial.md and focused-trial-feedback.csv.\r\nThis is not a native installer or a formal release.\r\n');
fs.writeFileSync(path.join(destination,'candidate.json'),JSON.stringify({kind:'unpublished-browser-trial',sourceBase:'596653b62d2fe33cb86f6578fe0a08349cb7ba39',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:path.join(root,'..'),encoding:'utf8'}).trim(),branch:'feat/first-minute-campus-trial',engine:{release:'beta0.9.5',sha256:hash},requires:'existing Node.js 22+, Windows x64',scope:['pet pat','local course notebook'],notVerified:['native candidate build','installation','system notifications','autostart','keychain','campus login','one-week trial']},null,2));
console.log('Candidate created: '+destination);
