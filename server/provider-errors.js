/** Safe, allowlisted upstream error mapping. Never return provider response bodies or API keys to the browser. */
export const PROVIDER_ERROR_MESSAGES = Object.freeze({
  MISSING_KEY: 'The Odds API received no API key. Check the server .env file and restart UltraX.',
  INVALID_KEY: 'The Odds API says this key is invalid. Regenerate it in your account, then update ODDS_API_KEY and restart UltraX.',
  DEACTIVATED_KEY: 'The Odds API says this key was deactivated. Check your account and replace the server key.',
  OUT_OF_USAGE_CREDITS: 'Your monthly API credits have been exhausted. Check usage in The Odds API dashboard.',
  EXCEEDED_FREQ_LIMIT: 'Too many API requests were made in a short period. Reduce the scan frequency.',
  INVALID_BOOKMAKERS: 'One or more requested sportsbooks are unsupported. Adjust the bookmaker selection.',
  INVALID_REGION: 'The requested sportsbook region is unsupported.',
  INVALID_MARKET: 'One or more requested player-prop markets are unavailable for this sport or endpoint.',
  INVALID_MARKET_COMBO: 'The requested market combination is unavailable for this sport.',
  INVALID_SPORT: 'The requested sport is not supported by this API request.',
  UNKNOWN_SPORT: 'The API did not recognize this sport.',
  EVENT_NOT_FOUND: 'The requested event could not be found. It may have started or ended.',
});
export function safeProviderError(responseCode, providerBody) {
  const code = typeof providerBody?.error_code === 'string' ? providerBody.error_code : '';
  const known = Object.hasOwn(PROVIDER_ERROR_MESSAGES,code);
  const message=known ? PROVIDER_ERROR_MESSAGES[code] :
    responseCode === 401 ? 'The Odds API rejected this key (HTTP 401). Confirm the key belongs to an active account.' :
    responseCode === 403 ? 'The Odds API denied this request (HTTP 403). Check account access and the specific sport or market.' :
    responseCode === 429 ? 'The Odds API rate limit was reached (HTTP 429).' :
    'The Odds API could not process this request (HTTP ' + String(responseCode) + ').';
  return { message, code:known?code:'PROVIDER_ERROR', httpStatus:responseCode };
}
export async function parseProviderError(response) {
  let body;
  try {body=await response.json();} catch {body=null;}
  return safeProviderError(response?.status,body);
}
