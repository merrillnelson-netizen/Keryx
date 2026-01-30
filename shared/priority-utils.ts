export interface PriorityInfo {
  label: string;
  description: string;
  color: string;
  bgClass: string;
}

export const PRIORITY_CONFIG: Record<number, PriorityInfo> = {
  10: { label: 'VIP', description: 'Spouse, partner, immediate family', color: 'red', bgClass: 'bg-red-500/20 text-red-400 border-red-500/30' },
  9: { label: 'Critical', description: 'Close family, business partners', color: 'orange', bgClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  8: { label: 'High', description: 'Close friends, key colleagues', color: 'amber', bgClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  7: { label: 'Important', description: 'Good friends, team members', color: 'yellow', bgClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  6: { label: 'Moderate', description: 'Acquaintances, regular contacts', color: 'lime', bgClass: 'bg-lime-500/20 text-lime-400 border-lime-500/30' },
  5: { label: 'Standard', description: 'Default - occasional contacts', color: 'green', bgClass: 'bg-green-500/20 text-green-400 border-green-500/30' },
  4: { label: 'Low', description: 'Infrequent contacts', color: 'teal', bgClass: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  3: { label: 'Minimal', description: 'Rare contacts', color: 'cyan', bgClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  2: { label: 'Background', description: 'Historical mentions', color: 'sky', bgClass: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  1: { label: 'Archive', description: 'Archived/inactive', color: 'slate', bgClass: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

const DEFAULT_PRIORITY: PriorityInfo = { 
  label: 'Unknown', 
  description: 'Not set', 
  color: 'gray', 
  bgClass: 'bg-gray-500/20 text-gray-400 border-gray-500/30' 
};

export function getPriorityInfo(priority: number): PriorityInfo {
  return PRIORITY_CONFIG[priority] || DEFAULT_PRIORITY;
}

export function getPriorityLabel(priority: number): string {
  return getPriorityInfo(priority).label;
}

export function getPriorityDescription(priority: number): string {
  return getPriorityInfo(priority).description;
}

export function getPriorityDisplayInfo(priority: number): { label: string; description: string; color: string } {
  const info = getPriorityInfo(priority);
  return { label: info.label, description: info.description, color: info.color };
}

export function getPriorityColor(priority: number): string {
  return getPriorityInfo(priority).color;
}

export function getPriorityBgClass(priority: number): string {
  return getPriorityInfo(priority).bgClass;
}

export const HIGH_SIGNAL_MIN_PRIORITY = 8;
export const DEFAULT_PRIORITY_VALUE = 5;
