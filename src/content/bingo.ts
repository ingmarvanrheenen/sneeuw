// Trip-bingo: dingen die op elke wintersport gebeuren. Elke speler krijgt er 16 van op de eigen kaart.
// Kort houden: een vakje is ±1/4 van een telefoonscherm breed. Lange woorden krijgen een zacht afbreekstreepje (\u00ad). Ids nooit hergebruiken (afgevinkte vakjes staan op id).

export interface BingoSquare {
  id: string
  text: string
}

export const BINGO_SQUARES: BingoSquare[] = [
  { id: 'handschoen-lift', text: 'Handschoen kwijt in de lift' },
  { id: 'uitstappen-val', text: 'Iemand valt bij het uitstappen' },
  { id: 'eerste-zwart', text: 'Eerste zwarte piste' },
  { id: 'eerste-lift', text: 'In de eerste lift van de dag' },
  { id: 'laatste-lift', text: 'Mee met de laatste lift' },
  { id: 'apres-hut', text: 'Gegeten in de après-ski-hut' },
  { id: 'kaasfondue', text: 'Fondue of raclette' },
  { id: 'gondel-zingen', text: 'Gezongen in de gondel' },
  { id: 'sleeplift-eraf', text: 'Van de sleeplift gevallen' },
  { id: 'verkeerde-piste', text: 'Verkeerde piste genomen' },
  { id: 'kwijt-in-mist', text: 'Elkaar kwijt in de mist' },
  { id: 'poeder', text: 'Tot je knieën in de poeder' },
  { id: 'skier-vraagt', text: 'Een skiër vraagt de weg' },
  { id: 'crew-foto', text: 'Crewfoto op de top' },
  { id: 'trick-geland', text: 'Nieuwe trick geland' },
  { id: 'ollie-bult', text: 'Ollie over een bultje' },
  { id: 'switch-piste', text: 'Hele piste switch' },
  { id: 'yard-sale', text: 'Yard sale: alles verspreid over de piste' },
  { id: 'stoeltje-stop', text: 'Stoeltjes\u00adlift staat stil' },
  { id: 'brillen-beslagen', text: 'Goggle beslagen' },
  { id: 'telefoon-koud', text: 'Telefoon uit door de kou' },
  { id: 'sneeuw-in-broek', text: 'Sneeuw in je broek' },
  { id: 'binding-los', text: 'Binding los op de piste' },
  { id: 'vast-op-vlak', text: 'Vast op een vlak stuk' },
  { id: 'lopen-vlak', text: 'Stuk lopen met je board' },
  { id: 'park-kicker', text: 'Over een kicker in het park' },
  { id: 'box-rail', text: 'Box of rail geprobeerd' },
  { id: 'sneeuwballen', text: 'Sneeuw\u00adballen\u00adgevecht' },
  { id: 'zonnebrand', text: 'Verbrand ondanks de kou' },
  { id: 'helm-sticker', text: 'Nieuwe sticker op je helm' },
  { id: 'liftpas-kwijt', text: 'Liftpas kwijt (en weer gevonden)' },
  { id: 'wax', text: 'Board gewaxt' },
  { id: 'filmpje', text: 'Clip voor de kluis gefilmd' },
  { id: 'carve-lijn', text: 'Strakke carve met spoor als bewijs' },
  { id: 'butter', text: 'Butter op de piste' },
  { id: 'apres-dans', text: 'Gedanst op skischoenen' },
  { id: 'warme-choco', text: 'Warme chocomel op de berg' },
  { id: 'wachtrij', text: 'Kwartier in de rij voor de lift' },
  { id: 'lawine-bord', text: 'Lawinebord gelezen (en begrepen)' },
  { id: 'vroeg-op', text: 'Om 7 uur wakker voor de berg' },
]

export const BINGO_SIZE = 4
