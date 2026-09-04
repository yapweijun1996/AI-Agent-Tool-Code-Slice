// function commentedOutFunction() {}
// class CommentedClass { method() {} }

const sqlLike = "function stringFunction() { return 1; } class StringClass {}";

function realFunction() {
  const s = `template with function fakeInTemplate() {} inside`;
  return s;
}
