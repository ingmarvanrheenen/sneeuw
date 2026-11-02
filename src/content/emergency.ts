// Noodnummers per land, voor de noodkaart (offline). Alleen nummers die landelijk gelden; 112 werkt in heel
// Europa. Pistediensten verschillen per gebied: dat nummer vul je zelf in (staat op je skipas of pistekaart).

export interface EmergencyNumber {
  label: string
  nr: string
  note?: string
}

export interface EmergencyCountry {
  id: string
  name: string
  /** het nummer om als eerste te bellen */
  main: string
  numbers: EmergencyNumber[]
  /** wat je ter plekke moet weten */
  tip?: string
}

export const EMERGENCY_COUNTRIES: EmergencyCountry[] = [
  {
    id: 'FR',
    name: 'Frankrijk',
    main: '112',
    numbers: [
      { label: 'Alarmnummer', nr: '112', note: 'Ook voor bergredding' },
      { label: 'Ambulance (SAMU)', nr: '15' },
      { label: 'Politie', nr: '17' },
      { label: 'Brandweer', nr: '18' },
    ],
    tip: 'Op de piste: de pistedienst (pisteurs) komt het snelst. Buiten de piste: 112.',
  },
  {
    id: 'AT',
    name: 'Oostenrijk',
    main: '112',
    numbers: [
      { label: 'Alarmnummer', nr: '112' },
      { label: 'Bergredding (Bergrettung)', nr: '140' },
      { label: 'Ambulance', nr: '144' },
      { label: 'Politie', nr: '133' },
    ],
  },
  {
    id: 'CH',
    name: 'Zwitserland',
    main: '112',
    numbers: [
      { label: 'Alarmnummer', nr: '112' },
      { label: 'Luchtredding (Rega)', nr: '1414' },
      { label: 'Ambulance', nr: '144' },
      { label: 'Politie', nr: '117' },
    ],
  },
  {
    id: 'IT',
    name: 'Italië',
    main: '112',
    numbers: [
      { label: 'Alarmnummer', nr: '112' },
      { label: 'Ambulance', nr: '118', note: 'Werkt nog in een deel van de regio’s' },
    ],
  },
  {
    id: 'DE',
    name: 'Duitsland',
    main: '112',
    numbers: [
      { label: 'Alarmnummer (ook ambulance en bergredding)', nr: '112' },
      { label: 'Politie', nr: '110' },
    ],
  },
  { id: 'ES', name: 'Spanje', main: '112', numbers: [{ label: 'Alarmnummer', nr: '112' }] },
  {
    id: 'NO',
    name: 'Noorwegen',
    main: '113',
    numbers: [
      { label: 'Ambulance', nr: '113' },
      { label: 'Politie', nr: '112' },
      { label: 'Brandweer', nr: '110' },
    ],
  },
  { id: 'SE', name: 'Zweden', main: '112', numbers: [{ label: 'Alarmnummer', nr: '112' }] },
  { id: 'NL', name: 'Nederland', main: '112', numbers: [{ label: 'Alarmnummer', nr: '112' }], tip: 'Indoor: meld het ook bij de baan.' },
  {
    id: 'US',
    name: 'Verenigde Staten en Canada',
    main: '911',
    numbers: [{ label: 'Alarmnummer', nr: '911' }],
  },
  {
    id: 'JP',
    name: 'Japan',
    main: '119',
    numbers: [
      { label: 'Ambulance en brandweer', nr: '119' },
      { label: 'Politie', nr: '110' },
    ],
  },
]

export const COUNTRY_BY_ID = new Map(EMERGENCY_COUNTRIES.map((c) => [c.id, c]))

/** Wat te doen bij een ongeluk op de piste. Kort, in volgorde. */
export const ACCIDENT_STEPS: { title: string; body: string }[] = [
  {
    title: 'Eerst jezelf veilig',
    body: 'Stop boven de plek, niet eronder. Help pas als je zelf niet geraakt kunt worden.',
  },
  {
    title: 'Zet de plek af',
    body: 'Zet je board rechtop in de sneeuw boven de plek (of kruis ski’s), zodat anderen jullie op tijd zien.',
  },
  {
    title: 'Bel',
    body: 'Pistedienst of het alarmnummer. Zeg wie je bent, wat er gebeurde, waar (piste, lift, paalnummer) en hoeveel gewonden.',
  },
  {
    title: 'Niet verplaatsen',
    body: 'Bij pijn in nek of rug: laten liggen en de helm op houden, tenzij iemand niet ademt.',
  },
  {
    title: 'Blijf erbij',
    body: 'Houd warm (jas eronder en eroverheen), niet laten eten of drinken, en blijf tot de hulp er is.',
  },
]
