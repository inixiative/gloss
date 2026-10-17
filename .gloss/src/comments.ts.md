# src/comments.ts

## jsxCommentContainers

a JSX expression container with no expression can only be braces wrapping a comment; the
object-literal reading of `foo({/* x */})` is a different node, so the braces are ours to remove.
