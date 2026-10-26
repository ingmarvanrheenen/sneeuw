import type { PackItem } from '../lib/types'
import { uid } from '../lib/ids'

const TEMPLATE: Record<string, string[]> = {
  'Op de piste': [
    'Snowboardjas',
    'Snowboardbroek',
    'Helm',
    'Goggle (+ reservelens)',
    'Handschoenen of wanten',
    'Buff / nekwarmer',
    'Thermo-ondergoed (2 sets)',
    'Fleece of mid layer',
    'Skisokken (geen katoen!)',
    'Impact shorts',
    'Wrist guards',
    'Back protector',
  ],
  Gear: ['Board', 'Bindingen', 'Boots', 'Leash', 'Multitool / schroevendraaier', 'Wax'],
  'Klein spul': [
    'Zonnebrand factor 50',
    'Lippenbalsem met SPF',
    'Zonnebril',
    'Powerbank',
    'Oordopjes',
    'Klein rugzakje',
    'Waterfles',
    'Snacks / repen',
  ],
  Documenten: ['ID-kaart / paspoort', 'Zorgpas (EHIC)', 'Reisverzekering met wintersport', 'Skipas / vouchers', 'Pinpas + wat cash'],
  'Après & huisje': ['Snowboots / warme schoenen', 'Muts', 'Comfy kleren', 'Zwembroek (sauna/zwembad)', 'Toilettas', 'Opladers', 'Speaker'],
}

export function defaultPacking(): PackItem[] {
  return Object.entries(TEMPLATE).flatMap(([category, items]) => items.map((label) => ({ id: uid(), label, category, checked: false })))
}
