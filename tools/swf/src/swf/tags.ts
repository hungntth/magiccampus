// SWF tag codes used by the pipeline, plus display names for summaries.

export const Tag = {
  End: 0,
  ShowFrame: 1,
  DefineShape: 2,
  PlaceObject: 4,
  RemoveObject: 5,
  DefineBits: 6,
  JPEGTables: 8,
  DoAction: 12,
  DefineBitsLossless: 20,
  DefineBitsJPEG2: 21,
  DefineShape2: 22,
  PlaceObject2: 26,
  RemoveObject2: 28,
  DefineShape3: 32,
  DefineBitsJPEG3: 35,
  DefineBitsLossless2: 36,
  DefineSprite: 39,
  FrameLabel: 43,
  DefineMorphShape: 46,
  ExportAssets: 56,
  PlaceObject3: 70,
  DoABCDefine: 72,
  SymbolClass: 76,
  DoABC: 82,
  DefineShape4: 83,
  DefineMorphShape2: 84,
  DefineBinaryData: 87,
  DefineBitsJPEG4: 90,
} as const;

export const SHAPE_TAGS: readonly number[] = [Tag.DefineShape, Tag.DefineShape2, Tag.DefineShape3, Tag.DefineShape4];

export const BITMAP_TAGS: readonly number[] = [
  Tag.DefineBits,
  Tag.DefineBitsJPEG2,
  Tag.DefineBitsJPEG3,
  Tag.DefineBitsJPEG4,
  Tag.DefineBitsLossless,
  Tag.DefineBitsLossless2,
];

export const TAG_NAMES: Record<number, string> = {
  0: 'End', 1: 'ShowFrame', 2: 'DefineShape', 4: 'PlaceObject', 5: 'RemoveObject', 6: 'DefineBits',
  8: 'JPEGTables', 9: 'SetBackgroundColor', 10: 'DefineFont', 11: 'DefineText', 12: 'DoAction',
  13: 'DefineFontInfo', 14: 'DefineSound', 15: 'StartSound', 20: 'DefineBitsLossless',
  21: 'DefineBitsJPEG2', 22: 'DefineShape2', 26: 'PlaceObject2', 28: 'RemoveObject2', 32: 'DefineShape3',
  33: 'DefineText2', 34: 'DefineButton2', 35: 'DefineBitsJPEG3', 36: 'DefineBitsLossless2',
  37: 'DefineEditText', 39: 'DefineSprite', 43: 'FrameLabel', 45: 'SoundStreamHead2', 46: 'DefineMorphShape',
  48: 'DefineFont2', 56: 'ExportAssets', 60: 'DefineVideoStream', 69: 'FileAttributes', 70: 'PlaceObject3',
  73: 'DefineFontAlignZones', 74: 'CSMTextSettings', 75: 'DefineFont3', 76: 'SymbolClass', 77: 'Metadata',
  78: 'DefineScalingGrid', 82: 'DoABC', 83: 'DefineShape4', 84: 'DefineMorphShape2', 86: 'DefineSceneAndFrameLabelData',
  87: 'DefineBinaryData', 88: 'DefineFontName', 90: 'DefineBitsJPEG4', 91: 'DefineFont4',
};
