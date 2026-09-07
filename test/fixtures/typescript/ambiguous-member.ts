class OwnerOAuthProvider {
  commit(): string {
    return "first";
  }

  commit(value: string): string {
    return value;
  }
}
