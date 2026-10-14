export function matchesDeletionConfirmation(confirmation: string, expectedName: string) {
  return confirmation === expectedName;
}

export function hasDependents(count: number | null) {
  return (count || 0) > 0;
}
