// Woordenboek: alle termen die je op de berg en in het park hoort.
export type TermCat = 'board' | 'gear' | 'berg' | 'sneeuw' | 'park' | 'tricks' | 'slang'

export const TERM_CATS: { id: TermCat; name: string }[] = [
  { id: 'board', name: 'Board & rijden' },
  { id: 'gear', name: 'Gear' },
  { id: 'berg', name: 'Berg 101' },
  { id: 'sneeuw', name: 'Sneeuw' },
  { id: 'park', name: 'Park' },
  { id: 'tricks', name: 'Trick-namen' },
  { id: 'slang', name: 'Slang' },
]

export interface Term {
  id: string
  term: string
  cat: TermCat
  def: string
  /** link naar een trick in de bijbel */
  trick?: string
}

const T = (cat: TermCat, term: string, def: string, trick?: string): Term => ({
  id: `${cat}-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  term,
  cat,
  def,
  trick,
})

export const TERMS: Term[] = [
  // Board & rijden
  T('board', 'Nose', 'De voorkant van je board (in je normale stance).'),
  T('board', 'Tail', 'De achterkant van je board.'),
  T('board', 'Heelside', 'De edge aan de kant van je hielen. Op je heelside kijk je naar het dal.', 'heelside-stop'),
  T('board', 'Toeside', 'De edge aan de kant van je tenen. Op je toeside kijk je naar de berg.', 'sideslip-toe'),
  T('board', 'Edge', 'De stalen rand van je board. Daarmee grip je in de sneeuw.'),
  T('board', 'Regular', 'Links voor rijden.', 'stance'),
  T('board', 'Goofy', 'Rechts voor rijden.', 'stance'),
  T('board', 'Switch', 'Rijden in je niet-normale stance.', 'switch'),
  T('board', 'Fakie', 'Achteruit rijden; in de praktijk vaak hetzelfde als switch.'),
  T('board', 'Valrichting', 'De lijn waarlangs een bal recht naar beneden zou rollen (fall line).'),
  T('board', 'Catching an edge', 'Je verkeerde edge haakt in de sneeuw en je slaat keihard om. Komt door kantelen naar de dalkant.'),
  T('board', 'Skidded turn', 'Een bocht waarbij je board een beetje slipt. Prima om te beginnen.'),
  T('board', 'Carve', 'Een bocht puur op je edge, zonder slippen. Je spoor is een dun lijntje.', 'carve-heel'),
  T('board', 'Stance width', 'De afstand tussen je bindingen. Meestal ongeveer je schouderbreedte.'),
  T('board', 'Duck stance', 'Bindingshoeken waarbij beide voeten naar buiten wijzen (bijv. +15/-15). Fijn voor switch en park.'),
  T('board', 'Setback', 'Bindingen iets naar achteren gezet. Handig in poeder.'),

  // Gear
  T('gear', 'Camber', 'Board buigt in het midden omhoog. Veel pop en grip; strakker om te rijden.'),
  T('gear', 'Rocker', 'Board buigt in het midden omlaag (als een banaan). Vergevingsgezind, drijft goed in poeder. Fijn als beginner.'),
  T('gear', 'Hybrid', 'Mix van camber en rocker. De meeste boards zijn tegenwoordig hybrid.'),
  T('gear', 'Flat camber', 'Board ligt plat tussen de bindingen. Speels en stabiel.'),
  T('gear', 'Flex', 'Hoe stijf je board is. Zacht = speels en makkelijk, stijf = stabiel op snelheid.'),
  T('gear', 'Twin tip', 'Neus en tail zijn precies hetzelfde. Rijdt switch net zo als normaal.'),
  T('gear', 'Directional', 'Board met een duidelijke neus en tail. Voor freeride en carven.'),
  T('gear', 'Directional twin', 'Twin-vorm maar met kleine verschillen. Allround.'),
  T('gear', 'Sidecut', 'De taille van je board. Bepaalt hoe groot je bochten van nature zijn.'),
  T('gear', 'Effective edge', 'Het deel van je edge dat de sneeuw raakt als je op je edge staat.'),
  T('gear', 'Base', 'De onderkant van je board. Sintered = sneller, extruded = makkelijk te repareren.'),
  T('gear', 'Waxen', 'Je base insmeren met wax zodat je beter glijdt en je base beschermd blijft.'),
  T('gear', 'Tuning', 'Edges slijpen en base repareren. Laat dit 1x per seizoen doen.'),
  T('gear', 'Wide board', 'Breder board voor grote voeten (vanaf maat 44–45), anders sleep je met je tenen.'),
  T('gear', 'Splitboard', "Board dat je in twee ski's kan splitsen om bergop te lopen."),
  T('gear', 'Highback', 'De achterkant van je binding waar je kuit tegenaan leunt.'),
  T('gear', 'Forward lean', 'Hoe ver je highback naar voren staat. Meer = meer controle op je heelside.'),
  T('gear', 'Strap binding', 'Gewone binding met ankle strap en toe strap.'),
  T('gear', 'Step-in', 'Binding waar je zonder straps in klikt (bijv. Burton Step On).'),
  T('gear', 'BOA', 'Draaisysteem om je boots vast te maken in plaats van veters.'),
  T('gear', 'Stomp pad', 'Grip-pad op je board tussen de bindingen voor je losse voet in de lift.'),
  T('gear', 'Leash', 'Riempje van je board aan je been. Verplicht in sommige gebieden.'),
  T('gear', 'VLT', 'Hoeveel licht je goggle doorlaat. Laag = zonnig, hoog = bewolkt/flat light.'),
  T('gear', 'Back protector', 'Rugbeschermer. Aanrader voor park.'),
  T('gear', 'Impact shorts', 'Broekje met padding voor je stuitje en heupen. Beginners love it.'),
  T('gear', 'Wrist guards', 'Polsbeschermers. Polsbreuk is de meest voorkomende snowboardblessure.'),
  T('gear', 'Waterkolom', 'Hoe waterdicht je jas/broek is (bijv. 10K, 20K). Hoger = droger.'),
  T('gear', 'Laagjes', 'Base layer (thermo), mid layer (fleece), shell (jas). Geen katoen!'),

  // Berg 101
  T('berg', 'Groene piste', 'Alleen in Frankrijk (en o.a. Spanje): de makkelijkste pistes. In Oostenrijk bestaan ze niet.'),
  T('berg', 'Blauwe piste', 'Makkelijk tot gemiddeld. In Oostenrijk de makkelijkste kleur.'),
  T('berg', 'Rode piste', 'Gemiddeld tot steil. In Frankrijk zijn rode pistes vaak pittiger dan in Oostenrijk.'),
  T('berg', 'Zwarte piste', 'Steil en/of bulten. Alleen als je echt goede bochten hebt.'),
  T(
    'berg',
    'Skiroute',
    'Gemarkeerde maar niet geprepareerde route (vaak oranje of gele bordjes in Oostenrijk). Niet gecontroleerd op lawines.',
  ),
  T('berg', 'Off-piste', 'Alles buiten de gemarkeerde pistes. Lawinegevaar, eigen verantwoordelijkheid.', 'offpiste-veilig'),
  T('berg', 'Lawinebericht', 'Dagelijkse lawineverwachting op schaal 1 (laag) tot 5 (zeer groot). Vanaf 3 is off-piste echt link.'),
  T('berg', 'Skipas', 'Liftkaart. Vaak een chipkaart in je linker jaszak (de poortjes lezen hem).'),
  T('berg', 'ESF', 'École du Ski Français: de grote skischool in Frankrijk. In Oostenrijk heet het Schischule.'),
  T('berg', 'Pistebully', "De ratrak die 's nachts de pistes glad maakt."),
  T('berg', 'Corduroy', 'Vers geprepareerde piste met ribbeltjes. Ideaal voor carven: wees er vroeg bij.'),
  T('berg', 'Sneeuwkanon', 'Maakt kunstsneeuw. Kunstsneeuw is harder en sneller dan natuursneeuw.'),
  T('berg', 'Après-ski', 'Feest na het skiën. In Oostenrijk groter dan in Frankrijk.'),
  T('berg', 'Hoogteziekte', 'Boven ~2500 m kan je hoofdpijn of kortademig zijn. Drink veel water.'),
  T('berg', 'Zon op de berg', 'UV is op hoogte veel sterker. Smeer factor 50, ook als het bewolkt is.'),
  T(
    'berg',
    'FIS-regels',
    'Verkeersregels op de piste: wie onder je rijdt heeft voorrang, stop niet op een onoverzichtelijk punt, kijk uphill voor je vertrekt.',
  ),
  T('berg', 'Flat light', 'Bewolkt licht waarbij je geen reliëf ziet. Kies een goggle met hoge VLT.'),
  T('berg', 'Cat track', "Vlak verbindingsweggetje tussen pistes. Snowboarders' nachtmerrie: speed houden!"),

  // Sneeuw
  T('sneeuw', 'Poeder', 'Verse, losse sneeuw. Drijven en zweven.', 'poeder'),
  T('sneeuw', 'Groomed', 'Geprepareerde piste.'),
  T('sneeuw', 'Crud', 'Opgereden poeder met sporen en klonten. Zwaar.'),
  T('sneeuw', 'Slush', 'Natte, papperige lentesneeuw. Traag maar zacht vallen.'),
  T('sneeuw', 'Ijs', 'Harde, gladde sneeuw. Scherpe edges en rustig aan.'),
  T('sneeuw', 'Crust', 'Harde korst op zachte sneeuw. Onvoorspelbaar.'),
  T('sneeuw', 'Spring snow', "Lentesneeuw: 's ochtends hard, 's middags lekker zacht."),
  T('sneeuw', 'Pow day', 'Dag met verse poeder. Iedereen meldt zich ziek.'),

  // Park
  T('park', 'Kicker', 'Een schans om te springen.', 'kicker-straight'),
  T('park', 'Lip', 'Het randje van de kicker waar je vanaf springt.'),
  T('park', 'Table', 'Het vlakke stuk tussen de kicker en de landing.'),
  T('park', 'Knuckle', 'De rand waar de table overgaat in de landing. Hier landen doet pijn.'),
  T('park', 'Landing', 'Het steile stuk na de kicker waar je hoort te landen.'),
  T('park', 'Sweet spot', 'De ideale plek om in de landing te landen.'),
  T('park', 'Box', 'Brede plank om over te glijden.', 'box-5050'),
  T('park', 'Rail', 'Smalle buis of rail om over te glijden.', 'rail-5050'),
  T('park', 'Jib', 'Alles waar je overheen glijdt dat geen sneeuw is (box, rail, boomstam).'),
  T('park', 'Halfpipe', 'Een U-vormige goot met hoge wanden.'),
  T('park', 'Drop in', 'Ergens in rijden vanaf een hoge rand (bijv. de halfpipe).'),
  T('park', 'Lijn (XS–XL)', 'Parken hebben lijnen per niveau. Begin altijd met XS of S.'),
  T('park', 'Dropping!', 'Wat je roept als je gaat, zodat anderen weten dat je komt.', 'park-etiquette'),
  T('park', 'Speed check', 'Vaart minderen voor een obstakel. Op de kicker zelf is dat gevaarlijk.'),

  // Trick-namen
  T('tricks', 'Frontside', 'Draaien met je borst eerst richting de rijrichting.', 'fs-180'),
  T('tricks', 'Backside', 'Draaien met je rug eerst richting de rijrichting.', 'bs-180'),
  T('tricks', 'Cab', 'Een frontside spin vanuit switch. Een half cab = switch frontside 180.'),
  T('tricks', '180 / 360 / 540', 'Aantal graden rotatie. 540 = anderhalve draai.'),
  T('tricks', 'Ollie', 'Springen vanuit je tail.', 'ollie'),
  T('tricks', 'Nollie', 'Springen vanuit je neus.', 'nollie'),
  T('tricks', 'Press', 'Op je neus of tail rijden.', 'nose-press'),
  T('tricks', 'Butter', 'Een press waarbij je draait.', 'nose-butter'),
  T('tricks', 'Grab', 'Je board vastpakken in de lucht.', 'grab-indy'),
  T('tricks', 'Tweak', 'Een grab extra aandikken door je board ver weg te duwen of te trekken.'),
  T('tricks', 'Indy', 'Achterste hand, toe edge tussen de bindingen.', 'grab-indy'),
  T('tricks', 'Mute', 'Voorste hand, toe edge.', 'grab-mute'),
  T('tricks', 'Melon', 'Voorste hand, heel edge tussen de bindingen.', 'grab-melon'),
  T('tricks', 'Stalefish', 'Achterste hand, heel edge achter je achterste been.', 'grab-stalefish'),
  T('tricks', 'Method', 'Melon met tweak: board omhoog achter je.', 'grab-method'),
  T('tricks', 'Japan', 'Mute met voorste knie omlaag en neus omhoog.', 'grab-japan'),
  T('tricks', 'Shifty', 'Board in de lucht even draaien en terug.', 'shifty'),
  T('tricks', 'Revert', 'Na een trick het board 180 terugdraaien op de sneeuw.', 'revert'),
  T('tricks', '50-50', 'Recht over een box of rail glijden.', 'box-5050'),
  T('tricks', 'Boardslide', 'Dwars over een box of rail, neus eerst.', 'boardslide'),
  T('tricks', 'Lipslide', 'Dwars over een rail, tail eerst over het obstakel.'),
  T('tricks', 'Cork', 'Schuine rotatie (deels spin, deels flip). Advanced.'),
  T('tricks', 'Rodeo', 'Backside flip met een draai. Advanced.'),

  // Slang
  T('slang', 'Shredden', 'Lekker hard snowboarden.'),
  T('slang', 'Send it', 'Er vol voor gaan.'),
  T('slang', 'Stomp', 'Een trick perfect landen.'),
  T('slang', 'Steez', 'Stijl + gemak. Iets er makkelijk en vet uit laten zien.'),
  T('slang', 'Sketchy', 'Net niet clean, wiebelig geland.'),
  T('slang', 'Bail', 'Een trick afbreken en eruit springen of vallen.'),
  T('slang', 'Yard sale', 'Een val waarbij je spullen over de hele piste liggen.'),
  T('slang', 'Slam', 'Een harde val.'),
  T('slang', 'Buttery', 'Smooth en soepel rijden.'),
  T('slang', 'Gaper', 'Iemand met een gat tussen helm en goggle (gaper gap). Niet zijn.'),
  T('slang', 'Park rat', 'Iemand die de hele dag in het park hangt.'),
  T('slang', 'Pow hound', 'Iemand die altijd op zoek is naar poeder.'),
  T('slang', 'First chair', 'De eerste lift van de dag pakken.'),
  T('slang', 'Huck', 'Je ergens vanaf gooien, vaak zonder veel techniek.'),
  T('slang', 'Chatter', 'Trillingen in je board op hoge snelheid.'),
]
