import { regionFor, type RegionKey } from './catalog';
import type { ISODate } from './types';
import { monthIndex } from './util';

export type Level = 'low' | 'moderate' | 'high';

export interface SeasonOutlook {
  label: string;
  rainRisk: Level;
  heatRisk: Level;
  coldEvenings: boolean;
  monsoon: boolean;
  notes: string[];
  /** Always shown with the outlook: this is general climatology, not a forecast. */
  disclaimer: string;
}

const DISCLAIMER = 'General seasonal guidance only — check a reliable forecast closer to the date.';

// Month indexes: 0 = Jan … 11 = Dec
const SW_MONSOON: Partial<Record<RegionKey, number[]>> = {
  kerala: [5, 6, 7, 8],
  karnataka: [5, 6, 7, 8],
  goa: [5, 6, 7, 8],
  maharashtra: [5, 6, 7, 8],
  gujarat: [6, 7, 8],
  rajasthan: [6, 7, 8],
  delhi_ncr: [6, 7, 8],
  punjab: [6, 7, 8],
  uttar_pradesh: [6, 7, 8],
  uttarakhand: [5, 6, 7, 8],
  west_bengal: [5, 6, 7, 8],
  telangana: [5, 6, 7, 8],
  india_other: [5, 6, 7, 8],
  tamil_nadu: [],
};
const NE_MONSOON: Partial<Record<RegionKey, number[]>> = {
  tamil_nadu: [9, 10, 11],
  kerala: [9, 10],
};
const HEAT: Partial<Record<RegionKey, number[]>> = {
  rajasthan: [3, 4, 5],
  delhi_ncr: [3, 4, 5],
  punjab: [4, 5],
  uttar_pradesh: [3, 4, 5],
  gujarat: [3, 4],
  telangana: [3, 4],
  tamil_nadu: [3, 4, 5],
  maharashtra: [3, 4],
  india_other: [3, 4],
};
const COLD_EVENINGS: Partial<Record<RegionKey, number[]>> = {
  rajasthan: [11, 0, 1],
  delhi_ncr: [11, 0, 1],
  punjab: [11, 0, 1],
  uttar_pradesh: [11, 0, 1],
  uttarakhand: [10, 11, 0, 1, 2],
};

export function seasonOutlook(city: string, country: string, date: ISODate): SeasonOutlook {
  const region = regionFor(city, country);
  if (region === 'international') {
    return {
      label: 'Seasonal outlook unavailable',
      rainRisk: 'moderate',
      heatRisk: 'low',
      coldEvenings: false,
      monsoon: false,
      notes: ['Seasonal guidance is built for Indian cities. Add the local climate risks to the brief manually.'],
      disclaimer: DISCLAIMER,
    };
  }
  const m = monthIndex(date);
  const sw = SW_MONSOON[region]?.includes(m) ?? false;
  const ne = NE_MONSOON[region]?.includes(m) ?? false;
  const heat = HEAT[region]?.includes(m) ?? false;
  const cold = COLD_EVENINGS[region]?.includes(m) ?? false;
  const notes: string[] = [];
  let label = 'Pleasant season';
  if (sw || ne) {
    label = ne && !sw ? 'North-east monsoon' : 'Monsoon season';
    notes.push('Plan covered or indoor fallbacks for every open-air session and keep dry walkways for guests and vendors.');
    notes.push('Flowers and fabrics need weather-safe storage; factor longer load-in times for wet ground.');
  }
  if (heat) {
    label = sw || ne ? label : 'Hot season';
    notes.push('Daytime heat: schedule outdoor sessions after sunset, add shade, hydration stations and cooling.');
  }
  if (cold) {
    label = 'Winter';
    notes.push('Evenings can get cold: plan heaters, shawls or covered seating for open-air evening sessions.');
  }
  if (!sw && !ne && !heat && !cold)
    notes.push('Typically a comfortable time of year for open-air sessions — still keep a simple rain plan.');
  return {
    label,
    rainRisk: sw || ne ? 'high' : 'low',
    heatRisk: heat ? 'high' : 'low',
    coldEvenings: cold,
    monsoon: sw || ne,
    notes,
    disclaimer: DISCLAIMER,
  };
}
