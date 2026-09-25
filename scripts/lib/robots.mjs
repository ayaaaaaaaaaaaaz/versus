/**
 * Just enough robots.txt to be a good citizen.
 *
 * Fetched and honoured at run time rather than checked once by hand, because a
 * site can change its mind and a scraper that only consulted the rules on the
 * day it was written is not actually obeying them.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const key = field.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      // Consecutive user-agent lines share one rule block.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return groups;
}

/**
 * Turns a robots path pattern into a regex.
 *
 * `*` matches any run of characters and may appear anywhere — Migros uses
 * `Disallow: /*espv`, which blocks every path containing "espv", not just ones
 * starting with it. A trailing `$` anchors the end. Treating `*` as literal
 * (or only stripping it from the end) silently turns such a rule into one that
 * matches nothing, which is the failure mode that looks like compliance.
 */
function patternToRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

/**
 * Longest-match wins, and an Allow beats a Disallow of the same length — the
 * behaviour the major crawlers converged on. Specificity is measured by the
 * pattern's literal length, wildcards excluded.
 */
export function isAllowed(robotsText, pathname, userAgent = '*') {
  const groups = parseRobots(robotsText);
  const ua = userAgent.toLowerCase();

  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? wildcard;
  if (!group) return true;

  let verdict = true;
  let best = -1;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (!patternToRegex(rule.path).test(pathname)) continue;
    const specificity = rule.path.replace(/[*$]/g, '').length;
    if (specificity > best || (specificity === best && rule.allow)) {
      best = specificity;
      verdict = rule.allow;
    }
  }
  return verdict;
}
