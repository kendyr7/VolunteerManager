export interface VolunteerNameCandidate {
  id: string;
  name: string;
  phone?: string | null;
  committeeId?: string | null;
  sourceRow?: number | null;
}

export interface VolunteerNameMatch extends VolunteerNameCandidate {
  score: number;
}

export function normalizeVolunteerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function stringSimilarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

function tokenDiceCoefficient(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  return (2 * intersection) / (leftSet.size + rightSet.size);
}

export function scoreVolunteerNameMatch(leftName: string, rightName: string): number {
  const left = normalizeVolunteerName(leftName);
  const right = normalizeVolunteerName(rightName);
  if (!left || !right) return 0;

  const leftTokens = left.split(' ');
  const rightTokens = right.split(' ');

  // A single given name is too common to be a useful duplicate signal.
  if (leftTokens.length < 2 || rightTokens.length < 2) return 0;
  if (left === right) return 1;

  const editScore = stringSimilarity(left, right);
  const tokenScore = tokenDiceCoefficient(leftTokens, rightTokens);
  const firstNameScore = stringSimilarity(leftTokens[0], rightTokens[0]);
  const surnameScore = tokenDiceCoefficient(leftTokens.slice(1), rightTokens.slice(1));

  const isStrongMatch =
    editScore >= 0.88 ||
    tokenScore >= 0.8 ||
    (firstNameScore >= 0.9 && surnameScore >= 0.67 && editScore >= 0.78);

  if (!isStrongMatch) return 0;
  return Math.max(editScore, tokenScore, (firstNameScore + surnameScore) / 2);
}

export function findPotentialVolunteerNameMatches(
  fullName: string,
  candidates: VolunteerNameCandidate[],
  limit = 3
): VolunteerNameMatch[] {
  return candidates
    .map(candidate => ({
      ...candidate,
      score: scoreVolunteerNameMatch(fullName, candidate.name),
    }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
