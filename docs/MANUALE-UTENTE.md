# Manuale utente

## Accesso

Aprire il link del gestionale e inserire nome utente e password ricevuti dall'amministratore.
"Resta connesso su questo dispositivo" evita di reinserire la password, ma è sconsigliato su computer condivisi.
La password si cambia da **menu utente → Profilo e password**.

Il gestionale funziona allo stesso modo su computer e smartphone; i dati sono condivisi e si aggiornano da soli ogni minuto
(o subito con il pulsante ⟳ in alto).

Ogni schermata lavora su **un solo esercizio finanziario**, scelto dalla tendina in alto a destra.

## Chi può fare cosa

Tutti gli utenti attivi **consultano** tutti i dati. Le modifiche dipendono dai permessi assegnati dall'amministratore:

| Permesso | Consente |
|---|---|
| Capitoli di spesa | creare, modificare ed eliminare capitoli e finanziamenti |
| Accordi quadro | creare, modificare ed eliminare accordi quadro e atti di adesione |
| Creazione ed eliminazione PdS | inserire nuovi PdS ed eliminarli (l'eliminazione è recuperabile: vedi «PdS eliminati») |
| Dati del PdS | modificare dati identificativi, invio, stipula, tempi di esecuzione e note |
| Pagamenti e saldo | registrare pagamenti, confermare o annullare il saldo |
| Allegati | aggiungere ed eliminare documenti e collegamenti |

I permessi sui PdS possono essere limitati ad alcuni capitoli (per codice, validi in tutti gli esercizi).
Le sezioni non modificabili mostrano un lucchetto; la pagina **Profilo e password** riepiloga i propri permessi.

Sono riservate all'**amministratore**: «Utenti e permessi», «Registro modifiche», lo «Storico modifiche» di ogni PdS e la sezione «PdS eliminati».

## Capitoli di spesa

Ogni capitolo appartiene a un **esercizio finanziario** e ha un **totale finanziato**. Per iniziare un nuovo anno usare
**Copia da esercizio**: crea gli stessi capitoli nel nuovo esercizio (con o senza importi).
Un capitolo con PdS collegati non può essere eliminato né spostato di esercizio.

Quando l'impegnato supera il finanziato compare un avviso rosso. L'inserimento non è bloccato e l'**amministratore** può
autorizzare il superamento (icona con lo scudo) indicando la **motivazione**, ad esempio una variazione di bilancio già richiesta:
l'avviso rosso lascia il posto all'etichetta «Autorizzato» e la motivazione resta nello storico.

Le colonne mostrano **Impegnato (Trasmesso)** e **Impegnato (Stipulato)**; le percentuali e il disponibile da impegnare
si leggono nella **Sintesi finanziaria**.

## Progetti di spesa

**Nuovo PdS** richiede numero e capitolo (che determina l'esercizio); il resto si completa nel tempo dalla scheda del PdS,
dove ogni sezione ha il proprio pulsante **Modifica**.

Numero ed **esercizio finanziario** si inseriscono separatamente: si digita `18`, si sceglie l'esercizio `2026` (che determina i capitoli
selezionabili) e il PdS compare ovunque come `18/2026`.

I **protocolli** (invio, stipula, pagamenti) si compilano con il **solo numero** (es. `0089567`) e con la data del campo accanto;
nelle schermate compaiono come «Prot. n. 0089567 del 15/01/2026».

- **Dati identificativi**: ditta, **accordo quadro** ed eventuale **atto di adesione**, ordinativo, **IDV** (un PdS può essere collegato a più IDV: si digita un codice e si preme Invio) e collaboratore/DEC.

- **Invio del progetto**: importo, protocollo e data. Il PdS risulta *inviato* quando c'è la data di invio.
- **Stipula**: protocollo, data e valore (può differire dall'importo inviato). La stipula risulta *avvenuta* quando c'è la data.
- **Tempi di esecuzione**: *durata* in giorni o mesi dalla stipula (la scadenza si calcola da sola) oppure *data fissa*.
- **Pagamenti e saldo**: si registrano i pagamenti man mano, ognuno con il numero di protocollo e la data; con **Conferma saldo** si chiude il PdS, eventualmente inserendo
  l'ultimo pagamento: il sistema registra il totale pagato e calcola l'**economia** (valore di stipula − totale pagato).
  Per correggere un pagamento dopo il saldo usare **Annulla saldo**.
- **Note** e **Allegati** (collegamenti a documenti, ad esempio nel sistema di protocollo, o file).
- **Storico modifiche**: chi ha cambiato cosa e quando (solo amministratore).

Il riquadro giallo **Verifiche sui dati** segnala possibili incoerenze (es. stipula precedente all'invio, numero duplicato): non blocca il salvataggio.

### Stati

| Stato | Significato |
|---|---|
| In preparazione | registrato, non ancora inviato |
| Inviato | inviato, in attesa di stipula |
| Stipulato | stipula registrata: il PdS è in esecuzione |
| Scaduto | termine superato senza saldo (resta conteggiato tra gli stipulati) |
| Saldato | saldo confermato |

### PdS eliminati

Chi ha il permesso «Creazione ed eliminazione PdS» può eliminare un PdS: non viene cancellato, ma spostato nella sezione
**PdS eliminati** con i suoi pagamenti e allegati. Da quel momento non compare negli elenchi, non è conteggiato nella sintesi
finanziaria e non è modificabile. Solo l'**amministratore** vede quella sezione e può **ripristinare** il PdS oppure
**eliminarlo definitivamente** (operazione non annullabile, tracciata nel registro).

## Accordi quadro

La sezione **Accordi quadro** elenca gli AQ con la loro **capienza contrattuale** (l'importo stipulato con la ditta), quanto è già
impegnato e quanto resta ordinabile. Ogni AQ ha stipula (protocollo e data), durata in giorni, DEC, oggetto, ditta e importo.

Aprendo un accordo quadro si vedono:

- gli **atti di adesione a quantità indeterminata**: hanno una propria stipula e una durata (predefinita 365 giorni) e impegnano la
  capienza dell'AQ **senza** impegnare fondi sui capitoli di spesa. Per ognuno si leggono valore stipulato, ordinato, residuo e pagato,
  con l'elenco dei PdS emessi sull'atto;
- gli **atti di adesione a quantità determinata**: sono semplicemente i PdS collegati direttamente all'accordo quadro; si inseriscono
  dalla creazione del PdS e impegnano sia la capienza dell'AQ sia i fondi del capitolo;
- **tutti gli ordinativi** dell'accordo quadro, con impegnato e pagato.

Quando si crea un PdS e lo si riferisce a un accordo quadro è possibile collegarlo anche a un atto di adesione a quantità indeterminata
dello stesso AQ: in quel caso il PdS impegna i fondi del capitolo e consuma la quota parte dell'atto.

## Elenco, filtri ed esportazione

In **Progetti di spesa** si filtra per capitolo, stato, collaboratore/DEC e avvisi dell'esercizio scelto, si cerca per numero, ditta,
ordinativo, IDV o protocollo e si ordina cliccando sulle intestazioni. L'indirizzo della pagina conserva i filtri: si può salvare tra i preferiti o inviare a un collega.
**Esporta** produce un file Excel o CSV con i PdS filtrati, il riepilogo per capitolo e quello per stato. Nei file Excel i dati sono
accompagnati da **grafici** dell'andamento finanziario; l'esportazione è disponibile anche in Capitoli di spesa, Sintesi finanziaria e
Accordi quadro.

Le righe **rosse** indicano PdS scaduti non saldati, quelle **gialle** PdS in scadenza.

## Scadenze e avvisi

Elenca i PdS scaduti non saldati e quelli in scadenza entro la soglia scelta (15, 30, 60, 90 giorni o un valore a piacere).

## Sintesi finanziaria

Per ogni capitolo dell'esercizio scelto: totale finanziato, **Impegnato (Trasmesso)** e **Impegnato (Stipulato)**
(tra parentesi gli importi trasmessi non ancora stipulati), pagato, **disponibile da impegnare** e residuo da pagare, con le percentuali.
Il disponibile da impegnare è il finanziato meno lo stipulato, più le **economie** dei PdS saldati: le economie tornano quindi
utilizzabili sul capitolo.
Il grafico confronta i valori per capitolo: la linea verticale indica il livello del finanziato.
L'icona ⚠ e il riquadro rosso segnalano i capitoli in cui l'impegnato supera il finanziato (situazione consentita ma da verificare),
salvo quelli per cui l'amministratore ha autorizzato il superamento.
Con la freccia a sinistra di ogni riga si vedono i PdS del capitolo. **Esporta** produce la sintesi in Excel (con il dettaglio dei PdS) o CSV.

## Registro modifiche (solo amministratore)

Elenco cronologico di tutte le modifiche, filtrabile per oggetto, utente e periodo.

## Amministratore

Da **Utenti e permessi**: creare utenti, assegnare ruolo e permessi, reimpostare password, disattivare o eliminare utenti.
Da **Progetti di spesa → PdS eliminati**: ripristinare o eliminare definitivamente i PdS eliminati dagli utenti.
Da **Capitoli di spesa**: autorizzare il superamento del finanziato di un capitolo, motivandolo.
Con l'archivio GitHub, quando un collega lascia l'ufficio, dopo averlo eliminato usare **Aggiorna token GitHub**.
