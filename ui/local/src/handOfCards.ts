import { isTouchDevice } from 'common/device';

export interface CardData {
  imageUrl: string;
  label: string;
  domId: string;
}

export interface HandOwner {
  view: () => HTMLElement;
  drops: () => { el: HTMLElement; selected?: string }[];
  cardData: () => Iterable<CardData>;
  select: (drop: HTMLElement, domId?: string) => void;
  autoResize?: boolean;
}

export class HandOfCards {
  cards: HTMLElement[] = [];
  userMidX: number;
  userMidY: number;
  startAngle = 0;
  startMag = 0;
  dragMag = 0;
  dragAngle: number = 0;
  frame: number = 0;
  killAnimation = 0;
  scaleFactor = 1;
  pointerDownTime?: number;
  rect: DOMRect;
  draggingCard: HTMLElement | null = null;

  constructor(readonly owner: HandOwner) {
    for (const c of owner.cardData()) this.cards.push(this.createCard(c));
    this.cards.reverse().forEach(card => this.view.appendChild(card));
    if (owner.autoResize) window.addEventListener('resize', this.resize);
  }

  get drops() {
    return this.owner.drops();
  }
  get view() {
    return this.owner.view();
  }
  get select() {
    return this.owner.select;
  }
  get selected() {
    return this.drops.map(x => this.card(x.selected));
  }
  card(id: string | undefined) {
    if (id?.startsWith('#')) id = id.slice(1);
    return this.cards.find(c => c.id === id);
  }

  createCard(c: CardData) {
    const card = $as<HTMLElement>(`<div id="${c.domId}" class="card">
      <img src="${c.imageUrl}">
      <label>${c.label}</label>
    </div>`);
    //if (this.drops.length > 1) {
    card.addEventListener('pointerdown', this.pointerDown);
    card.addEventListener('pointermove', this.pointerMove);
    card.addEventListener('pointerup', this.pointerUp);
    //}
    //card.addEventListener('click', e => this.click(e));
    card.addEventListener('mouseenter', this.mouseEnter);
    card.addEventListener('mouseleave', this.mouseLeave);
    card.addEventListener('dragstart', e => e.preventDefault());
    return card;
  }

  resize = () => {
    const newRect = this.view.getBoundingClientRect();
    if (this.rect && newRect.width === this.rect.width && newRect.height === this.rect.height) return;
    this.scaleFactor = parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue('---scale-factor'),
    );
    if (isNaN(this.scaleFactor)) this.scaleFactor = 1;
    const h2 = 192 * this.scaleFactor - (1 - Math.sqrt(3 / 4)) * this.fanRadius;
    this.rect = newRect;
    this.userMidX = this.view.offsetWidth / 2;
    this.userMidY = this.view.offsetHeight + Math.sqrt(3 / 4) * this.fanRadius - h2;
    this.animate();
    this.resetIdleTimer();
  };

  placeCards() {
    const visibleCards = Math.min(this.view.offsetWidth / 50, this.cards.length);
    const hovered = $as<HTMLElement>($('.card.pull'));
    const hoveredIndex = this.cards.findIndex(x => x == hovered);
    for (const [i, card] of this.cards.entries()) {
      if (this.transformSelect(card) || card === this.draggingCard) continue;
      card.style.opacity = '1';
      const pull = !hovered || i <= hoveredIndex ? 0 : (-(Math.PI / 2) * this.scaleFactor) / visibleCards;
      const fanout = ((Math.PI / 4) * (this.cards.length - i - 0.5)) / visibleCards;
      this.transform(card, -Math.PI / 8 + pull + this.dragAngle + fanout);
    }
  }

  transform(card: HTMLElement, angle: number) {
    const hovered = card.classList.contains('pull');
    const mag =
      15 + this.view.offsetWidth + (hovered ? 40 * this.scaleFactor + this.dragMag - this.startMag : 0);
    const x = this.userMidX + mag * Math.sin(angle) - 96 * this.scaleFactor;
    const y = this.userMidY - mag * Math.cos(angle);
    if (hovered) angle += Math.PI / 12;
    card.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
  }

  transformSelect(card: HTMLElement) {
    const dindex = this.drops.findIndex(x => x.selected?.slice(1) === card.id);
    if (dindex < 0) return false;
    const to = this.drops[dindex].el;
    const scale = to.offsetWidth / card.offsetWidth;
    const x = to.offsetLeft - card.offsetLeft + (to.offsetWidth - card.offsetWidth) / 2;
    const y = to.offsetTop - card.offsetTop + (to.offsetHeight - card.offsetHeight) / 2;
    card.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    card.style.opacity = '0';
    return true;
  }

  clientToOrigin(client: [number, number]): [number, number] {
    const originX = client[0] - (this.rect.left + window.scrollX) - this.userMidX;
    const originY = this.rect.top + window.scrollY + this.userMidY - client[1];
    return [originX, originY];
  }

  clientToView(client: [number, number]): [number, number] {
    const viewX = client[0] - (this.rect.left + window.scrollX);
    const viewY = client[1] - (this.rect.top + window.scrollY);
    return [viewX, viewY];
  }

  originToClient(origin: [number, number]): [number, number] {
    const clientX = this.rect.left + window.scrollX + this.userMidX + origin[0];
    const clientY = this.rect.top + window.scrollY + this.userMidY - origin[1];
    return [clientX, clientY];
  }

  getAngle(client: [number, number]): number {
    const translated = this.clientToOrigin(client);
    return Math.atan2(translated[0], translated[1]);
  }

  getMag(client: [number, number]): number {
    const userPt = this.clientToOrigin(client);
    return Math.sqrt(userPt[0] * userPt[0] + userPt[1] * userPt[1]);
  }

  mouseEnter = (e: MouseEvent) => {
    $(e.target as HTMLElement).addClass('pull');
    this.resetIdleTimer();
  };

  mouseLeave = (e: MouseEvent) => {
    $(e.target as HTMLElement).removeClass('pull');
    this.resetIdleTimer();
  };

  pointerDown = (e: PointerEvent) => {
    this.resetIdleTimer();
    this.pointerDownTime = Date.now();
    if (!this.draggingCard) {
      this.view.classList.add('dragging');
      this.draggingCard = e.currentTarget as HTMLElement;
      this.draggingCard.setPointerCapture(e.pointerId);
      //this.draggingCard.style.transition = 'none';
    }
  };

  pointerMove = (e: PointerEvent) => {
    if (!this.pointerDownTime || !this.draggingCard) return;
    e.preventDefault();
    this.draggingCard.style.transition = 'none';
    const viewPt = this.clientToView([e.clientX, e.clientY]);
    const viewX = viewPt[0] - 96 * this.scaleFactor;
    const viewY = viewPt[1] - 96 * this.scaleFactor;
    this.draggingCard.style.transform = `translate(${viewX}px, ${viewY}px)`;
    for (const drop of this.drops) drop.el?.classList.remove('drag-over');
    this.dropTarget(e)?.classList.add('drag-over');
    this.resetIdleTimer();
  };

  pointerUp = (e: PointerEvent) => {
    for (const drop of this.drops) drop.el?.classList.remove('drag-over');
    this.view.classList.remove('dragging');
    if (this.draggingCard) {
      //this.draggingCard.style.transition = '';
      this.draggingCard.releasePointerCapture(e.pointerId);
      const target = this.dropTarget(e);
      if (target) this.select(target, this.draggingCard.id);
    }
    this.draggingCard = null;
    this.resetIdleTimer();
    if (this.pointerDownTime && Date.now() - this.pointerDownTime < 500) this.click(e);
    this.pointerDownTime = undefined;
  };
  /* v0.0.1
  startDrag(e: PointerEvent): void {
    this.startAngle = this.getAngle([e.clientX, e.clientY]) - this.dragAngle;
    this.dragMag = this.startMag = this.getMag([e.clientX, e.clientY]);
    this.view.classList.add('dragging');
    this.draggingCard = e.currentTarget as HTMLElement;
    if (isTouchDevice()) {
      $('.card').removeClass('pull');
      this.draggingCard.classList.add('pull');
    }
    this.draggingCard.setPointerCapture(e.pointerId);
    this.draggingCard.style.transition = 'none';
    this.resetIdleTimer();
  }

  duringDrag(e: PointerEvent): void {
    e.preventDefault();
    if (!this.draggingCard) return;
    for (const drop of this.drops) drop.el?.classList.remove('drag-over');
    this.dropTarget(e)?.classList.add('drag-over');
    const newAngle = this.getAngle([e.clientX, e.clientY]);

    this.dragMag = this.getMag([e.clientX, e.clientY]);
    this.dragAngle = newAngle - this.startAngle;
    this.placeCards();
    this.resetIdleTimer();
  }

  endDrag(e: PointerEvent): void {
    for (const drop of this.drops) drop.el?.classList.remove('drag-over');
    $('.card').removeClass('pull');
    this.view.classList.remove('dragging');
    if (this.draggingCard) {
      this.draggingCard.style.transition = '';
      this.draggingCard.releasePointerCapture(e.pointerId);
      const target = this.dropTarget(e);
      if (target) this.select(target, this.draggingCard.id);
    }
    //this.startMag = this.dragMag = this.startAngle = this.dragAngle = 0;
    this.startMag = this.dragMag = this.startAngle = 0;
    this.draggingCard = null;
    this.placeCards();
    this.resetIdleTimer();
  }
  */
  click(e: PointerEvent) {
    console.log('click');
    let el = e.target as HTMLElement;
    while (el && !el.id) el = el.parentElement!;
    if (el?.id) {
      const drop = this.drops.find(x => !x.selected) || this.drops[this.drops.length - 1];
      drop.selected = el.id;
      //this.transformSelect(drop.el, el);
      el.classList.remove('pull');
      this.select(drop.el, el.id);
      this.resetIdleTimer();
    }
  }

  dropTarget(e: PointerEvent): HTMLElement | undefined {
    for (const drop of this.drops) {
      const r = drop.el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
        return drop.el;
    }
    return undefined;
  }

  animate = () => {
    if (document.contains(this.view)) this.placeCards();
    this.frame = requestAnimationFrame(this.animate);
  };

  resetIdleTimer(timeout = 300) {
    if (this.frame === 0) this.animate();
    clearTimeout(this.killAnimation);
    this.killAnimation = setTimeout(() => {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }, timeout);
  }

  get fanRadius() {
    return this.view.offsetWidth;
  }
}
