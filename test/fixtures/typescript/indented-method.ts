export class Box {

  save(value: string): string {
    return value;
  }

  reset(): void {
    // Keep the class boundary distinct from the method boundary.
  }
}
