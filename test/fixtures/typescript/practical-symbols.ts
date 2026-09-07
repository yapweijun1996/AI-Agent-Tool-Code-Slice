export enum Status {
  Ready,
  Done = "done",
}

export namespace OAuth {
  export const normalize = (value: string): string => value.trim();

  export function parse(value: string): string {
    return value;
  }
}

export module Legacy {
  export const ping = (): boolean => true;
}

export class OwnerOAuthProvider {
  commit = (value: string): string => value.trim();

  fallback = function (value: string): string {
    return value;
  };

  label = "owner";
}

export const handlers = {
  commit: (value: string): string => value.trim(),
  fallback: function (value: string): string {
    return value;
  },
  shorthand(value: string): string {
    return value;
  },
  label: "handlers",
};

export function buildHandlers() {
  const localHandlers = {
    commit: (value: string): string => value.trim(),
    shorthand(value: string): string {
      return value;
    },
  };
  return localHandlers;
}
