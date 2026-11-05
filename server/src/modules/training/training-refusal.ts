// A player-facing refusal of a training action (HMTXL room, tower, TXKC): the text is shown through the feature's own push
// (onSystemSay for the room and tower, onRedMsg for the course); nothing was changed when one is thrown.

export class TrainingRefusal extends Error {}

export const refuse = (text: string): TrainingRefusal => new TrainingRefusal(text);
