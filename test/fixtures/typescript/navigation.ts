export const topLevelValue = 1;

export class OwnerOAuthProvider {
  commit(value: string): string {
    const normalized = value.trim();
    if (normalized.length > 0) {
      const audit = normalized.toUpperCase();
      console.log(audit);
    }
    return normalized;
  }

  rollback(): boolean {
    return false;
  }
}

class OtherProvider {
  commit(): string {
    return "other";
  }
}
