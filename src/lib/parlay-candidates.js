/**
 * Distinguish real alternative prices from combinable parlay legs.
 * A quote on both sides of the same exact prop is not two independent picks.
 */
const asText = x=>typeof x==='string'?x.trim().toLowerCase():'';
export function sameProp(a,b) {
  return Boolean(a&&b && asText(a.eventId) && asText(a.eventId)===asText(b.eventId)
    && asText(a.player) && asText(a.player)===asText(b.player)
    && asText(a.marketKey) && asText(a.marketKey)===asText(b.marketKey)
    && Number.isFinite(a.line) && a.line===b.line);
}
export function conflictsWithSlip(candidate,selected) {
  return Boolean(selected.some(other=>sameProp(candidate,other)));
}
export function summarizeEligibility(picks,threshold=2) {
  const events=new Set(),qualifying=[];
  for(const pick of picks||[]) {
    const checks=pick?.research?.checks||[];
    const verified=id=>checks.some(c=>c.id===id&&c.status==='verified');
    const qualified=pick?.research?.status==='RESEARCH INCOMPLETE' &&
      pick?.research?.agreement==='AGREES' &&
      (pick.research.forecast?.walkForward?.testGames||0)>=8 &&
      ['roster','odds','form','schedule'].every(verified);
    if(qualified&&!events.has(pick.eventId)){
      events.add(pick.eventId);qualifying.push(pick);
    }
  }
  return {qualifying,distinctEvents:events.size,canSuggest:events.size>=threshold};
}
