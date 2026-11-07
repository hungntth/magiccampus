// Choose-one chests ported as explicit id maps from the Go server (the gift box lists are not data driven): application/item/
// effect_teacher_medal_choice.go (itemChoiceChests), effect_paid_choice_chest.go (paid chests), effect_pet_choice_bags.go,
// effect_feather_box.go (feather choice bag levels) and effect_thankhi_bags.go (sub Than Khi choice box). Each pick grants the
// listed item template (usually another bag that is opened by hand afterwards, like Go).

/** Free item choice chests: bag id -> the item templates offered (Go itemChoiceChests). */
export const ITEM_CHOICE_CHESTS: Readonly<Record<number, readonly number[]>> = {
  6575: [5289, 6284],
  5211: [5184, 5185],
  5212: [5186, 5188, 5187, 5189],
  5213: [5196, 5197],
  5214: [5198, 5199, 5200, 5201],
  6028: [6006, 6007, 6008, 6009, 6010, 6011, 6012, 6013, 6014, 6015, 6016, 6017, 6018, 6019, 6020, 6021, 6022, 6023, 6024, 6025, 6026, 6027],
  5280: [5158, 5159, 5160, 5161, 5162, 5163, 5164, 5165, 5166, 5167, 5168, 5169, 5170],
  5917: [4452, 4517, 4497, 4557, 4522, 4537, 4527, 4532],
  5916: [4453, 4518, 4498, 4558, 4523, 4538, 4528, 4533],
  4597: [4454, 4519, 4499, 4524, 4529, 4534],
  4720: [4686, 4685, 4671, 4669],
  4672: [4669, 4671],
  4785: [2967, 3757, 3896, 3979, 3814, 3465],
  6294: [5304, 5305, 5342, 6187, 6295, 6980],
  6632: [4803, 4804, 6492, 6636],
};

/** Paid choice chests: bag id -> the free chest whose list it offers, and the non-bound gold charged on every pick. */
export const PAID_CHOICE_CHESTS: Readonly<Record<number, { base: number; gold: number }>> = {
  5710: { base: 4785, gold: 1500 },
  6665: { base: 4720, gold: 2120 },
};

/** Pet choice bags: bag id -> creature ids, offered at grow rate PET_CHOICE_GROW_RATE. */
export const PET_CHOICE_BAGS: Readonly<Record<number, readonly number[]>> = {
  5266: [2073, 2075, 2076, 1671, 2074],
};
export const PET_CHOICE_GROW_RATE = 2.5;

/** Feather choice bags: bag id -> feather level (candidates: every "Long Vu <X> Cap N" template, sorted by id). */
export const FEATHER_CHOICE_BAGS: Readonly<Record<number, number>> = { 4924: 4, 5281: 5 };
/** Feather templates: item kind 14, types 1401-1404. */
export const FEATHER_KIND = 14;
export const FEATHER_TYPES: readonly [number, number] = [1401, 1404];

/** Sub Than Khi choice box: bag id -> equipment colour (blue = 2); candidates are kind 8 / type 801 equipment of that colour. */
export const THAN_KHI_CHOICE_BAGS: Readonly<Record<number, number>> = { 4873: 2 };
export const MW_KIND = 8;
export const MW_SUB_TYPE = 801;
