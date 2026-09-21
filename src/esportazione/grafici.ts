import { unzipSync, zipSync } from 'fflate';

/**
 * Grafici nativi nei file Excel.
 *
 * `write-excel-file` produce solo i dati; qui il pacchetto `.xlsx` (che è uno
 * zip di file XML) viene riaperto e completato con le parti `chart` e `drawing`
 * previste da OpenXML, in modo che i grafici siano veri grafici di Excel,
 * aggiornabili e non immagini.
 */

export interface SerieGrafico {
  /** Colonna dei valori (indice 0-based nel foglio). */
  colonna: number;
  /** Colore della serie, esadecimale senza "#". */
  colore: string;
}

export interface DefinizioneGrafico {
  /** Foglio a cui agganciare il grafico (indice 0-based nell'ordine dei fogli). */
  foglio: number;
  /** Nome del foglio, usato nei riferimenti alle celle. */
  nomeFoglio: string;
  titolo: string;
  tipo: 'barre' | 'barreOrizzontali' | 'linee';
  /** Colonna delle etichette (indice 0-based). */
  categorie: number;
  serie: SerieGrafico[];
  /** Numero di righe di dati (l'intestazione è sempre la riga 1). */
  righe: number;
  /** Riga (0-based) da cui iniziare a disegnare il grafico. */
  ancoraRiga: number;
  /** Colonna (0-based) da cui iniziare a disegnare il grafico. */
  ancoraColonna?: number;
  larghezzaColonne?: number;
  altezzaRighe?: number;
}

const NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_DRAWING_MAIN = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_SPREADSHEET_DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

/** Indice 0-based → lettera di colonna Excel (0 → A, 26 → AA). */
export function lettereColonna(indice: number): string {
  let n = indice;
  let testo = '';
  do {
    testo = String.fromCharCode(65 + (n % 26)) + testo;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return testo;
}

function xml(testo: string): string {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Riferimento assoluto a un intervallo: 'Nome foglio'!$C$2:$C$11 */
function riferimento(nomeFoglio: string, colonna: number, daRiga: number, aRiga: number): string {
  const c = lettereColonna(colonna);
  const foglio = `'${nomeFoglio.replace(/'/g, "''")}'`;
  return xml(daRiga === aRiga ? `${foglio}!$${c}$${daRiga}` : `${foglio}!$${c}$${daRiga}:$${c}$${aRiga}`);
}

function serieXml(g: DefinizioneGrafico, s: SerieGrafico, indice: number): string {
  const ultima = g.righe + 1;
  const marker = g.tipo === 'linee' ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : '';
  const riempimento =
    g.tipo === 'linee'
      ? `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${s.colore}"/></a:solidFill></a:ln></c:spPr>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${s.colore}"/></a:solidFill></c:spPr>`;
  const coda = g.tipo === 'linee' ? '<c:smooth val="0"/>' : '';
  const invertIfNegative = g.tipo === 'linee' ? '' : '<c:invertIfNegative val="0"/>';
  return (
    `<c:ser><c:idx val="${indice}"/><c:order val="${indice}"/>` +
    `<c:tx><c:strRef><c:f>${riferimento(g.nomeFoglio, s.colonna, 1, 1)}</c:f></c:strRef></c:tx>` +
    riempimento +
    invertIfNegative +
    marker +
    `<c:cat><c:strRef><c:f>${riferimento(g.nomeFoglio, g.categorie, 2, ultima)}</c:f></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${riferimento(g.nomeFoglio, s.colonna, 2, ultima)}</c:f></c:numRef></c:val>` +
    coda +
    '</c:ser>'
  );
}

function graficoXml(g: DefinizioneGrafico): string {
  const AX_CAT = 111111111;
  const AX_VAL = 222222222;
  const serie = g.serie.map((s, i) => serieXml(g, s, i)).join('');
  const corpo =
    g.tipo === 'linee'
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${serie}<c:marker val="1"/><c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:lineChart>`
      : `<c:barChart><c:barDir val="${g.tipo === 'barreOrizzontali' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${serie}<c:gapWidth val="80"/><c:overlap val="-20"/><c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:barChart>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_DRAWING_MAIN}" xmlns:r="${NS_REL}">` +
    '<c:chart>' +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="it-IT"/><a:t>${xml(g.titolo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    '<c:autoTitleDeleted val="0"/>' +
    '<c:plotArea><c:layout/>' +
    corpo +
    `<c:catAx><c:axId val="${AX_CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${AX_VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${AX_VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${AX_CAT}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    '</c:plotArea>' +
    '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart></c:chartSpace>'
  );
}

function ancoraXml(g: DefinizioneGrafico, indice: number, idRelazione: string): string {
  const colonna = g.ancoraColonna ?? 0;
  const larghezza = g.larghezzaColonne ?? 9;
  const altezza = g.altezzaRighe ?? 18;
  return (
    '<xdr:twoCellAnchor>' +
    `<xdr:from><xdr:col>${colonna}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.ancoraRiga}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${colonna + larghezza}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.ancoraRiga + altezza}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    '<xdr:graphicFrame macro="">' +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="${indice + 2}" name="Grafico ${indice + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
    `<a:graphic><a:graphicData uri="${NS_CHART}"><c:chart xmlns:c="${NS_CHART}" xmlns:r="${NS_REL}" r:id="${idRelazione}"/></a:graphicData></a:graphic>` +
    '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>'
  );
}

const codificatore = new TextEncoder();
const decodificatore = new TextDecoder();

/**
 * Completa un file `.xlsx` con i grafici indicati.
 * Restituisce il nuovo contenuto del file.
 */
export function aggiungiGrafici(contenuto: Uint8Array, grafici: DefinizioneGrafico[]): Uint8Array {
  if (grafici.length === 0) return contenuto;
  const file = unzipSync(contenuto);
  const perFoglio = new Map<number, DefinizioneGrafico[]>();
  for (const g of grafici) {
    const elenco = perFoglio.get(g.foglio);
    if (elenco) elenco.push(g);
    else perFoglio.set(g.foglio, [g]);
  }

  let contatoreGrafici = 0;
  const override: string[] = [];

  for (const [indiceFoglio, elenco] of perFoglio) {
    const numeroFoglio = indiceFoglio + 1;
    const percorsoFoglio = `xl/worksheets/sheet${numeroFoglio}.xml`;
    if (!file[percorsoFoglio]) continue;

    const numeroDisegno = numeroFoglio;
    const ancore: string[] = [];
    const relazioniDisegno: string[] = [];

    elenco.forEach((g, i) => {
      contatoreGrafici += 1;
      const numeroGrafico = contatoreGrafici;
      file[`xl/charts/chart${numeroGrafico}.xml`] = codificatore.encode(graficoXml(g));
      override.push(`<Override ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml" PartName="/xl/charts/chart${numeroGrafico}.xml"/>`);
      const idRelazione = `rIdChart${i + 1}`;
      ancore.push(ancoraXml(g, i, idRelazione));
      relazioniDisegno.push(
        `<Relationship Id="${idRelazione}" Type="${NS_REL}/chart" Target="../charts/chart${numeroGrafico}.xml"/>`,
      );
    });

    file[`xl/drawings/drawing${numeroDisegno}.xml`] = codificatore.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${NS_SPREADSHEET_DRAWING}" xmlns:a="${NS_DRAWING_MAIN}">${ancore.join('')}</xdr:wsDr>`,
    );
    file[`xl/drawings/_rels/drawing${numeroDisegno}.xml.rels`] = codificatore.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relazioniDisegno.join('')}</Relationships>`,
    );
    override.push(`<Override ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" PartName="/xl/drawings/drawing${numeroDisegno}.xml"/>`);

    // relazione foglio → disegno
    const percorsoRels = `xl/worksheets/_rels/sheet${numeroFoglio}.xml.rels`;
    const relsEsistenti = file[percorsoRels]
      ? decodificatore.decode(file[percorsoRels])
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    file[percorsoRels] = codificatore.encode(
      relsEsistenti.replace(
        '</Relationships>',
        `<Relationship Id="rIdDrawing" Type="${NS_REL}/drawing" Target="../drawings/drawing${numeroDisegno}.xml"/></Relationships>`,
      ),
    );

    // il foglio deve dichiarare il disegno
    const foglio = decodificatore.decode(file[percorsoFoglio]);
    file[percorsoFoglio] = codificatore.encode(foglio.replace('</worksheet>', '<drawing r:id="rIdDrawing"/></worksheet>'));
  }

  const tipi = decodificatore.decode(file['[Content_Types].xml']);
  file['[Content_Types].xml'] = codificatore.encode(tipi.replace('</Types>', `${override.join('')}</Types>`));

  return zipSync(file, { level: 6 });
}
