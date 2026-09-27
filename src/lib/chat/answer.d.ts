import type { ChatAnswer, ChatCatalog, ChatProgram } from "./types";

export function answerQuestion(catalog: ChatCatalog, rawQuery: string): ChatAnswer;
export function formatProgramLine(program: ChatProgram): string;
