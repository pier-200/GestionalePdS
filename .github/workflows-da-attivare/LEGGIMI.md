# Workflow di GitHub Actions da attivare

Questi tre workflow sono pronti ma **non ancora attivi**: il token usato per il primo push
non aveva il permesso `workflow`, che GitHub richiede per creare file sotto `.github/workflows/`.

| File | Cosa fa |
|---|---|
| `pubblica.yml` | compila l'applicazione e la pubblica su GitHub Pages a ogni push su `main` |
| `supabase-installa.yml` | esegue lo script SQL sul progetto Supabase |
| `supabase-attivo.yml` | evita la sospensione dei progetti Supabase gratuiti inattivi |

## Come attivarli

Dal computer con la copia del repository:

```bash
gh auth refresh -s workflow        # autorizza il permesso "workflow" nel browser
git mv .github/workflows-da-attivare .github/workflows
git rm .github/workflows/LEGGIMI.md
git commit -m "ci: attiva i workflow di GitHub Actions"
git push
```

## Situazione attuale

Il sito è già online su **https://pier-200.github.io/GestionalePdS/**, servito dal ramo
`gh-pages`: lo aggiorna `npm run pubblica`, che compila e sostituisce il contenuto del ramo.

Attivando `pubblica.yml` la pubblicazione diventa automatica a ogni push su `main`; in quel caso
in **Settings → Pages** la sorgente va impostata su **GitHub Actions** (al posto del ramo
`gh-pages`) e `npm run pubblica` non serve più.
