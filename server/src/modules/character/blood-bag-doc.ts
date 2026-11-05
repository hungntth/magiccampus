// Blood bag storage guard: characters created before M9 have no `bloodBag` array, and dotted `bloodBag.N` updates on a
// missing field neither match equality guards nor create an array. Call before any dotted bloodBag write.

import type { Model } from 'mongoose';
import type { Character } from './character.schema';

export async function ensureBloodBag(chars: Model<Character>, characterId: number): Promise<void> {
  await chars.updateOne(
    { _id: characterId, 'bloodBag.3': { $exists: false } },
    [{
      $set: {
        bloodBag: {
          $map: {
            input: [0, 1, 2, 3],
            as: 'i',
            in: { $max: [0, { $ifNull: [{ $arrayElemAt: [{ $cond: [{ $isArray: '$bloodBag' }, '$bloodBag', []] }, '$$i'] }, 0] }] },
          },
        },
      },
    }],
  );
}
