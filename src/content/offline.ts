// Wat er op de berg zonder bereik werkt, en wat internet nodig heeft. Voor de offline-check (/offline).
import type { IconName } from '../design/icons'

export interface OfflineItem {
  icon: IconName
  title: string
  detail: string
}

export const WORKS_OFFLINE: OfflineItem[] = [
  { icon: 'log', title: 'Je dag loggen', detail: 'Ook met foto, clip en spraakmemo; synct zodra je bereik hebt' },
  { icon: 'lift', title: 'Run-teller', detail: 'Ook met GPS, zolang de app open is' },
  { icon: 'bolt', title: 'Warming-up en cooling-down', detail: 'Met de 3D-rider' },
  { icon: 'book', title: 'Trickbijbel', detail: 'Alle tricks met uitleg en animatie' },
  { icon: 'phone', title: 'Noodkaart', detail: 'Alarmnummers en je locatie, ook zonder bereik' },
  { icon: 'edit', title: 'Tekenen op je clip', detail: 'Voor clips die op dit toestel staan' },
  { icon: 'list', title: "Programma's", detail: 'Kant-en-klaar en die je van de coach kreeg' },
  { icon: 'trophy', title: 'Stickerboek en badges', detail: 'Alles wordt uit je eigen data berekend' },
  { icon: 'suitcase', title: 'Je trips en paklijst', detail: 'Ook het tripplan van de coach' },
]

export const NEEDS_INTERNET: OfflineItem[] = [
  { icon: 'chat', title: 'Coach Daddy', detail: 'Chat, dagreview, tripplan en techniek-check' },
  { icon: 'crew', title: 'Crew', detail: 'Feed, waar is de crew, het potje en stemmen' },
  { icon: 'snow', title: 'Weer en pow-alarm', detail: 'Je ziet de laatste stand die je ophaalde' },
  { icon: 'cloud', title: 'Media uit de cloud', detail: 'Clips van je crew of van een ander toestel' },
  { icon: 'bell', title: 'Meldingen', detail: 'Komen binnen zodra je weer bereik hebt' },
]
