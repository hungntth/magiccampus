// Name + title lines under an entity's feet (legacy RoundedText: Arial 12 with soft black shadows).
// CreatureView._textName y=10; with a permanent title (CharactorView.setTitle) the title takes y=10 and the name y=25;
// the active/temporary title (CharactorView._actTile) sits at name+15.

import { Container, Text, TextStyle } from 'pixi.js';

const LABEL_TOP = 10;
const LABEL_LINE = 15;

const labelStyle = (fill: string): TextStyle =>
  new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: 12, fill, stroke: { color: '#000000', width: 2.5, join: 'round' } });

/** A title line (data_tbl_title style 'color|prefix|suffix' already applied by the caller). */
export interface TitleLabel {
  text: string;
  color: string;
}

export class EntityLabels extends Container {
  private readonly nameLine: Text;
  private title: Text | null = null;
  private actTitle: Text | null = null;

  constructor(displayName: string, color: string) {
    super();
    this.eventMode = 'none';
    this.nameLine = this.line(displayName, color);
    this.layout();
  }

  setName(text: string): void {
    this.nameLine.text = text;
  }

  /** Permanent title above the name and active/temporary title below it; null hides a line. */
  setTitles(title: TitleLabel | null, actTitle: TitleLabel | null): void {
    this.title?.destroy();
    this.actTitle?.destroy();
    this.title = title?.text ? this.line(title.text, title.color) : null;
    this.actTitle = actTitle?.text ? this.line(actTitle.text, actTitle.color) : null;
    this.layout();
  }

  private line(text: string, color: string): Text {
    const t = new Text({ text, style: labelStyle(color) });
    t.anchor.set(0.5, 0);
    this.addChild(t);
    return t;
  }

  private layout(): void {
    this.title?.position.set(0, LABEL_TOP);
    this.nameLine.position.set(0, this.title ? LABEL_TOP + LABEL_LINE : LABEL_TOP);
    this.actTitle?.position.set(0, this.nameLine.y + LABEL_LINE);
  }
}
