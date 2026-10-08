# Pubblicazione passo passo

Al termine di questa guida il gestionale sarà raggiungibile da un indirizzo del tipo
`https://<account>.github.io/gestionale-pds/`, da qualsiasi computer o smartphone, e funzionerà
in autonomia sui server di GitHub: **non serve tenere acceso alcun computer**.

Tutte le operazioni si svolgono dal browser. Se possibile eseguirle da un computer senza restrizioni di rete;
la verifica finale si fa dal computer di lavoro.

---

## Fase 1 – Pubblicare l'applicazione su GitHub Pages

> Consiglio di sicurezza: usare un account GitHub (o un'organizzazione) dedicato all'ufficio, con l'autenticazione a due fattori attiva,
> e non pubblicarvi altre pagine web: i siti GitHub Pages di uno stesso account condividono lo spazio di memoria del browser.

1. Accedere a GitHub e creare un repository: <https://github.com/new>
   - *Repository name*: `gestionale-pds`
   - Visibilità: **Public** (GitHub Pages gratuito richiede un repository pubblico; il codice non contiene dati né segreti).
   - Non aggiungere README. Premere **Create repository**.
2. Nella pagina del repository vuoto scegliere **uploading an existing file**, trascinare nella pagina **tutto il contenuto** della cartella del progetto
   **esclusi** `node_modules`, `dist` e `test-results` (sono circa 95 file, entro il limite di 100 per caricamento), poi **Commit changes**.
   In alternativa si può usare GitHub Desktop o `git`.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Scheda **Actions**: selezionare il workflow **"Pubblica su GitHub Pages"** e premere **Run workflow**
   (se era già partito al caricamento, prima dell'attivazione di Pages, la sua pubblicazione può essere fallita: basta riavviarlo).
   Dura circa 2–3 minuti: compila, esegue i test e pubblica.
5. L'indirizzo compare nel riepilogo del workflow e in **Settings → Pages**. Aprendolo si vede il gestionale in **modalità dimostrativa**
   (utenti di prova elencati nella pagina di accesso).

## Fase 2 – Verificare la rete del computer di lavoro

Dal computer di lavoro aprire `https://<account>.github.io/gestionale-pds/#/diagnostica`.

- Se **GitHub API** risulta raggiungibile, l'archivio GitHub funzionerà.
- Il pulsante **Copia risultati** produce un riepilogo da inviare al referente informatico, se necessario.


---

## Fase 3 – Archivio su repository GitHub

### 1. Creare i due repository

1. <https://github.com/new> → nome `pds-dati`, visibilità **Private**, spuntare **Add a README file** → Create.
2. <https://github.com/new> → nome `pds-accessi`, visibilità **Public**, spuntare **Add a README file** → Create.
   Conterrà solo il portachiavi cifrato, che l'applicazione deve poter leggere prima dell'accesso.

### 2. Creare il token di accesso

1. Foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Token name*: `Gestionale PdS`; *Expiration*: la durata massima consentita (annotare la data: alla scadenza un amministratore lo rinnova dalla pagina di accesso).
3. *Repository access*: **Only select repositories** → `pds-dati` e `pds-accessi`.
4. *Permissions → Repository permissions → Contents*: **Read and write** (Metadata resta "Read-only").
5. **Generate token** e copiare il valore (`github_pat_…`): servirà una sola volta al punto 4.

### 3. Configurare l'applicazione

Nel repository `gestionale-pds` aprire `public/config.json`, premere la matita (**Edit**) e sostituire il contenuto con:

```json
{
  "nomeUfficio": "Nome del vostro ufficio",
  "sogliaScadenzaGiorni": 30,
  "backend": {
    "tipo": "github",
    "owner": "<account>",
    "repoDati": "pds-dati",
    "repoAccessi": "pds-accessi"
  }
}
```

(`<account>` è il nome dell'account o dell'organizzazione GitHub). Premere **Commit changes** e attendere la nuova pubblicazione (scheda Actions, 2–3 minuti).

### 4. Configurazione iniziale

Aprire il gestionale: compare **Configurazione iniziale**. Inserire il token, il nome utente dell'amministratore (es. `mario.rossi`),
nome e cognome e una password (almeno 10 caratteri con lettere e cifre). Premere **Configura e accedi**.

### 5. Utenti

Da **Utenti e permessi → Nuovo utente** creare i colleghi, assegnando i permessi e comunicando la password iniziale in modo riservato.
Ognuno può cambiarla da **Profilo e password**.

### Manutenzione (archivio GitHub)

- **Backup**: ogni salvataggio è un commit nel repository `pds-dati`; da GitHub si può consultare o ripristinare qualsiasi versione e scaricare lo ZIP.
- **Token scaduto**: all'accesso l'amministratore vede la richiesta di un nuovo token; crearne uno come al punto 2 e incollarlo. Gli altri utenti non devono fare nulla.
- **Un collega lascia l'ufficio**: eliminarlo (o disattivarlo) e poi **Utenti e permessi → Aggiorna token GitHub** con un token nuovo; quindi revocare il vecchio token su GitHub.
- **Password dell'unico amministratore dimenticata**: nel repository `pds-accessi` eliminare `keyring.json`, riaprire il gestionale e ripetere la configurazione
  iniziale **con lo stesso nome utente** dell'amministratore (i dati restano intatti), poi reimpostare le password degli altri utenti.

---

## Riepilogo dei file di configurazione

| File | Scopo |
|---|---|
| `public/config.json` | archivio dati usato, nome dell'ufficio, soglia predefinita degli avvisi |
| `.github/workflows-da-attivare/pubblica.yml` | compilazione, test e pubblicazione su GitHub Pages |

> I workflow sono in `.github/workflows-da-attivare/` e vanno spostati in `.github/workflows/` per entrare in funzione: vedi `LEGGIMI.md` in quella cartella.
> Nel frattempo il sito è online su <https://pier-200.github.io/GestionalePdS/> (ramo `gh-pages`) e si aggiorna con `npm run pubblica`.

