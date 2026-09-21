// Pubblica su GitHub Pages il contenuto di `dist/` nel ramo `gh-pages`.
//
// Serve finché i workflow restano in `.github/workflows-da-attivare/`: il token
// di `gh` non ha il permesso `workflow`, quindi la pubblicazione automatica di
// GitHub Actions non è attiva e il sito viene aggiornato da qui.
//
//   npm run pubblica
//
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAMO = 'gh-pages';
const git = (...argomenti) => execFileSync('git', argomenti, { stdio: 'inherit' });
const gitMuto = (...argomenti) => execFileSync('git', argomenti, { encoding: 'utf8' }).trim();

if (gitMuto('status', '--porcelain')) {
  console.error('Ci sono modifiche non salvate: esegui prima il commit, così il sito pubblicato corrisponde al codice.');
  process.exit(1);
}

console.log('Compilazione…');
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });

const cartella = mkdtempSync(join(tmpdir(), 'pds-pages-'));
try {
  git('worktree', 'add', '--detach', cartella, '-q');
  const nel = (...argomenti) => execFileSync('git', ['-C', cartella, ...argomenti], { stdio: 'inherit' });
  // ramo locale usa e getta: il ramo pubblicato si aggiorna solo lato remoto
  nel('checkout', '--orphan', 'pubblicazione-in-corso', '-q');
  nel('rm', '-rf', '.', '-q');
  cpSync('dist', cartella, { recursive: true });
  // senza .nojekyll GitHub Pages ignora i file che iniziano con "_"
  writeFileSync(join(cartella, '.nojekyll'), '');
  nel('add', '-A');
  nel('commit', '-q', '-m', `deploy: ${gitMuto('rev-parse', '--short', 'HEAD')}`);
  nel('push', '-q', '--force', 'origin', `HEAD:${RAMO}`);
  console.log('Pubblicato: https://pier-200.github.io/GestionalePdS/');
} finally {
  git('worktree', 'remove', cartella, '--force');
  rmSync(cartella, { recursive: true, force: true });
}
