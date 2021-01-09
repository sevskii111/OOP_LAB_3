function line_intersects(line1: Line, line2: Line) {
  const s1_x = line1.point2.x - line1.point1.x,
    s1_y = line1.point2.y - line1.point1.y,
    s2_x = line2.point2.x - line2.point1.x,
    s2_y = line2.point2.y - line2.point1.y;

  const s =
      (-s1_y * (line1.point1.x - line2.point1.x) +
        s1_x * (line1.point1.y - line2.point1.y)) /
      (-s2_x * s1_y + s1_x * s2_y),
    t =
      (s2_x * (line1.point1.y - line2.point1.y) -
        s2_y * (line1.point1.x - line2.point1.x)) /
      (-s2_x * s1_y + s1_x * s2_y);

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

enum ShapeType {
  Canvas,
  Rectangle,
  Circle,
  Triangle,
}

const ShapeNamesMap = {
  [ShapeType.Canvas]: "Canvas",
  [ShapeType.Rectangle]: "Rectangle",
  [ShapeType.Circle]: "Circle",
  [ShapeType.Triangle]: "Triangle",
};

export class Point {
  x: number;
  y: number;

  static readonly zero = new Point(0, 0);
  static readonly unit = new Point(1, 1);

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  rotateAround(center: Point, angle: number): void {
    const radians = (Math.PI / 180) * angle,
      cos = Math.cos(radians),
      sin = Math.sin(radians),
      nx = cos * (this.x - center.x) + sin * (this.y - center.y) + center.x,
      ny = cos * (this.y - center.y) - sin * (this.x - center.x) + center.y;
    this.x = nx;
    this.y = ny;
  }
}

export interface Line {
  point1: Point;
  point2: Point;
}

export class Transform {
  position: Point;
  rotation: number;
  scale: Point;

  static readonly default = new Transform(Point.zero, 0, Point.unit);
  static readonly zero = new Transform(Point.zero, 0, Point.zero);

  add(other: Transform) {
    return new Transform(
      new Point(
        this.position.x + other.position.x,
        this.position.y + other.position.y
      ),
      this.rotation + other.rotation,
      new Point(this.scale.x * other.scale.x, this.scale.y * other.scale.y)
    );
  }

  constructor(position: Point, rotation: number, scale: Point) {
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }
}

export class Param {
  id: string;
  name: string;
}

abstract class Shape {
  get type(): ShapeType {
    return null;
  }

  parent: Shape;
  transform: Transform;
  children: Shape[];
  selected: boolean;

  constructor(transform: Transform, parent: Shape) {
    this.transform = transform;
    this.children = [];
    this.selected = false;
    this.parent = parent;
  }

  addChild(child: Shape) {
    this.children.push(child);
  }

  removeChild(child: Shape) {
    this.children = this.children.filter((node) => node !== child);
  }

  abstract getPoints(): Point[];
  abstract isIntersecting(ngon: Shape): boolean;
  abstract isPointInside(point: Point): boolean;
  abstract isStable(): boolean;
  abstract getCenter(): Point;
  abstract draw(
    ctx: CanvasRenderingContext2D,
    parentCenter: Point,
    parentTransform: Transform
  ): void;

  abstract getParams(): Param[];
}

abstract class NGon extends Shape {
  points: Point[];
  drawPoints: Point[];

  constructor(transform: Transform, parent: Shape) {
    super(transform, parent);
    this.drawPoints = [];
  }

  isStable() {
    for (const point of this.drawPoints) {
      if (!this.parent.isPointInside(point)) return false;
    }
    for (const sibling of this.parent.children.filter(
      (node: Shape) => node !== this
    )) {
      for (const point of this.drawPoints) {
        if (sibling.isPointInside(point)) return false;
      }
      for (const point of sibling.getPoints()) {
        if (this.isPointInside(point)) return false;
      }
      if (this.isIntersecting(sibling)) {
        return false;
      }
    }
    return true;
  }

  getCenter(): Point {
    return this.drawPoints.reduce(function (
      prev: Point,
      curr: Point,
      _: number,
      points: Point[]
    ): Point {
      return new Point(
        prev.x + curr.x / points.length,
        prev.y + curr.y / points.length
      );
    },
    new Point(0, 0));
  }

  draw(
    ctx: CanvasRenderingContext2D,
    parentCenter: Point = null,
    parentTransform: Transform = null
  ): void {
    if (parentCenter === null) {
      parentCenter = new Point(0, 0);
    }
    if (parentTransform === null) {
      parentTransform = new Transform(Point.zero, 0, Point.unit);
    }
    const absoluteTransform = new Transform(
      new Point(
        parentCenter.x + this.transform.position.x,
        parentCenter.y + this.transform.position.y
      ),
      parentTransform.rotation + this.transform.rotation,
      new Point(
        parentTransform.scale.x * this.transform.scale.x,
        parentTransform.scale.y * this.transform.scale.y
      )
    );
    this.drawPoints = this.points.map((point) => {
      const drawPoint = new Point(
        parentCenter.x +
          this.transform.position.x +
          point.x * absoluteTransform.scale.x,
        parentCenter.y +
          this.transform.position.y +
          point.y * absoluteTransform.scale.y
      );
      drawPoint.rotateAround(
        new Point(absoluteTransform.position.x, absoluteTransform.position.y),
        this.transform.rotation
      );
      drawPoint.rotateAround(parentCenter, parentTransform.rotation);

      return drawPoint;
    });
    const prevStrokeStyle = ctx.strokeStyle;
    if (this.isStable()) {
      ctx.strokeStyle = "black";
    } else {
      ctx.strokeStyle = "red";
    }
    ctx.beginPath();
    ctx.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
    for (let i = 1; i < this.drawPoints.length; i++) {
      ctx.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
    }
    ctx.lineTo(this.drawPoints[0].x, this.drawPoints[0].y);
    ctx.stroke();

    this.children.forEach((child) =>
      child.draw(ctx, this.getCenter(), absoluteTransform)
    );

    ctx.strokeStyle = prevStrokeStyle;
  }

  getPoints() {
    return this.drawPoints;
  }

  isPointInside(point: Point): boolean {
    const { x, y } = point;

    let inside: boolean = false;
    for (
      var i = 0, j = this.drawPoints.length - 1;
      i < this.drawPoints.length;
      j = i++
    ) {
      var xi = this.drawPoints[i].x,
        yi = this.drawPoints[i].y;
      var xj = this.drawPoints[j].x,
        yj = this.drawPoints[j].y;

      var intersect =
        yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  isIntersecting(shape: Shape): boolean {
    if (!(shape instanceof NGon)) {
      throw "Not implemented";
    }
    const ngon: NGon = shape as NGon;
    let myLines: Line[] = [];
    for (let i = 0; i < this.drawPoints.length; i++) {
      myLines.push({
        point1: this.drawPoints[i],
        point2: this.drawPoints[(i + 1) % this.drawPoints.length], //Мы хотим получить все линии, в том числе от последней точки к стартовой
      });
    }
    let ngonLines: Line[] = [];
    for (let i = 0; i < ngon.drawPoints.length; i++) {
      ngonLines.push({
        point1: ngon.drawPoints[i],
        point2: ngon.drawPoints[(i + 1) % ngon.drawPoints.length], //Мы хотим получить все линии, в том числе от последней точки к стартовой
      });
    }
    for (const myLine of myLines) {
      for (const ngonLine of ngonLines) {
        if (line_intersects(myLine, ngonLine)) {
          return true;
        }
      }
    }
    return false;
  }
}

export class Rectangle extends NGon {
  get type(): ShapeType {
    return ShapeType.Rectangle;
  }

  constructor(
    width: number,
    height: number,
    transform: Transform,
    parent: Shape
  ) {
    super(transform, parent);
    this.points = [];
    const hWidth: number = width / 2;
    const hHeight: number = height / 2;
    this.points.push(new Point(-hWidth, +hHeight));
    this.points.push(new Point(+hWidth, +hHeight));
    this.points.push(new Point(+hWidth, -hHeight));
    this.points.push(new Point(-hWidth, -hHeight));
  }

  getParams() {
    return [
      { id: "width", name: "Width" },
      { id: "height", name: "Height" },
    ];
  }

  static buildFromParams(parent, transfrom: Transform, { width, height }) {
    return new Rectangle(width, height, transfrom, parent);
  }
}

export class Circle extends NGon {
  get type(): ShapeType {
    return ShapeType.Circle;
  }

  pointsAmount: number = 100;
  constructor(radius: number, transform: Transform, parent: Shape = null) {
    super(transform, parent);
    this.points = [];
    const rotationAngle: number = (Math.PI * 2) / this.pointsAmount;
    let angle: number = 0;
    for (let i = 0; i < this.pointsAmount; i++) {
      this.points.push(
        new Point(Math.cos(angle) * radius, Math.sin(angle) * radius)
      );
      angle += rotationAngle;
    }
  }

  getParams() {
    return [{ id: "radius", name: "Radius" }];
  }

  static buildFromParams(parent, transfrom: Transform, { radius }) {
    return new Circle(radius, transfrom, parent);
  }
}

export class Triangle extends NGon {
  get type(): ShapeType {
    return ShapeType.Triangle;
  }

  constructor(
    point1: Point,
    point2: Point,
    point3: Point,
    transform: Transform,
    parent: Shape = null
  ) {
    super(transform, parent);
    this.points = [point1, point2, point3];
  }

  getParams() {
    return [
      { id: "point1_x", name: "X1" },
      { id: "point1_y", name: "Y1" },
      { id: "point2_x", name: "X2" },
      { id: "point2_y", name: "Y2" },
      { id: "point3_x", name: "X3" },
      { id: "point3_y", name: "Y3" },
    ];
  }

  static buildFromParams(
    parent,
    transfrom: Transform,
    { point1_x, point1_y, point2_x, point2_y, point3_x, point3_y }
  ) {
    return new Triangle(
      new Point(point1_x, point1_y),
      new Point(point2_x, point2_y),
      new Point(point3_x, point3_y),
      transfrom,
      parent
    );
  }
}

export class Canvas extends Rectangle {
  get type(): ShapeType {
    return ShapeType.Canvas;
  }

  isStable() {
    return true;
  }

  constructor(width: number, height: number, transform: Transform) {
    super(width, height, transform, null);
  }
}

export interface IElement {
  getElement(): HTMLElement;
  render(canvas: Canvas | null): void;
}

export class Hierarchy implements IElement {
  private readonly element: HTMLUListElement;
  selectNode: (node: Shape) => void;

  constructor(selectNode: (node: Shape) => void) {
    this.element = document.createElement("ul");
    this.element.classList.add("tree");
    this.selectNode = selectNode;
  }

  getElement(): HTMLUListElement {
    return this.element;
  }

  private makeHierarchy(node: Shape): HTMLLIElement {
    let li = document.createElement("li");

    let span = document.createElement("span");
    span.innerText = ShapeNamesMap[node.type];
    if (node.selected) {
      span.classList.add("active");
    }
    span.addEventListener("click", () => {
      this.selectNode(node);
    });
    li.appendChild(span);

    let innerUl = document.createElement("ul");
    for (const child of node.children) {
      innerUl.appendChild(this.makeHierarchy(child));
    }

    li.appendChild(innerUl);
    return li;
  }

  render(canvas: Canvas): void {
    this.element.innerHTML = "";
    this.element.appendChild(this.makeHierarchy(canvas));
  }
}

export class CreationForm implements IElement {
  private readonly element: HTMLDivElement;
  private shape: any;
  private isEdit: boolean;
  private readonly shapes: any[];
  createtNode: (type: any, transform: Transform, params: any) => boolean;
  previewNode: (type: any, transform: Transform, params: any) => void;
  cancel: () => void;
  translate: (translate: Transform) => boolean;
  previewTranslate: (translate: Transform) => void;

  constructor(
    shapes: any[],
    createtNode: (type: any, transform: Transform, params: any) => boolean,
    previewNode: (type: any, transform: Transform, params: any) => void,
    cancel: () => void,
    translate: (translate: Transform) => boolean,
    previewTranslate: (translate: Transform) => void
  ) {
    this.shapes = shapes;
    this.createtNode = createtNode;
    this.previewNode = previewNode;
    this.cancel = cancel;
    this.translate = translate;
    this.previewTranslate = previewTranslate;
    this.element = document.createElement("div");
    this.render();
  }

  getElement() {
    return this.element;
  }

  private setShape(shape: any): void {
    this.shape = shape;
    this.render();
  }

  render() {
    this.element.innerHTML = "";

    if (!this.shape && !this.isEdit) {
      {
        const label = document.createElement("label");
        label.classList.add("mr-2");
        label.innerText = "Edit:";
        this.element.appendChild(label);
        const btn = document.createElement("div");
        btn.classList.add("btn", "btn-primary", "mr-2");
        btn.innerText = "Edit";
        btn.addEventListener("click", () => {
          this.isEdit = true;
          this.render();
        });
        this.element.appendChild(btn);
      }
      {
        const label = document.createElement("label");
        label.classList.add("mr-2");
        label.innerText = "Create:";
        this.element.appendChild(label);
        const btnsGroup = document.createElement("div");
        btnsGroup.classList.add("btn-group");
        for (const shape of this.shapes) {
          this.isEdit = false;
          const btn = document.createElement("button");
          btn.classList.add("btn", "btn-success");
          btn.innerText = ShapeNamesMap[shape.prototype.type];
          btn.addEventListener("click", (e) => {
            this.setShape(shape);
          });
          btnsGroup.appendChild(btn);
        }
        this.element.appendChild(btnsGroup);
      }
    } else {
      const cancelBtn = document.createElement("button");
      cancelBtn.classList.add("btn", "btn-danger", "mb-1");
      cancelBtn.innerText = "Cancel";
      cancelBtn.addEventListener("click", (e) => {
        if (this.isEdit) {
          this.previewTranslate(Transform.zero);
          this.isEdit = false;
          this.cancel();
          this.render();
        } else {
          this.shape = null;
          this.cancel();
          this.render();
        }
      });
      this.element.appendChild(cancelBtn);

      let inputs: HTMLInputElement[] = [];
      if (!this.isEdit) {
        const inputGroupParams = document.createElement("div");
        inputGroupParams.classList.add("input-group", "d-flex", "mb-1");
        const params = this.shape.prototype.getParams();
        for (const param of params) {
          const input = document.createElement("input");
          input.classList.add("form-control");
          input.placeholder = param.name;
          input.name = param.id;
          inputs.push(input);
          inputGroupParams.appendChild(input);
        }
        this.element.appendChild(inputGroupParams);
      }

      const inputGroupTransform = document.createElement("div");
      inputGroupTransform.classList.add("input-group", "d-flex");

      const xLabel = document.createElement("label");
      xLabel.classList.add("d-flex", "col-form-label");
      xLabel.textContent = "X:";
      const xInput = document.createElement("input");
      xInput.classList.add("form-control", "w-auto", "mt-n2", "mr-2", "ml-1");
      xInput.value = "0";
      xLabel.appendChild(xInput);
      inputGroupTransform.appendChild(xLabel);

      const yLabel = document.createElement("label");
      yLabel.classList.add("d-flex", "col-form-label");
      yLabel.textContent = "Y:";
      const yInput = document.createElement("input");
      yInput.classList.add("form-control", "w-auto", "mt-n2", "mr-2", "ml-1");
      yInput.value = "0";
      yLabel.appendChild(yInput);
      inputGroupTransform.appendChild(yLabel);

      const rotationLabel = document.createElement("label");
      rotationLabel.classList.add("d-flex", "col-form-label");
      rotationLabel.textContent = "Rotation(deg):";
      const rotationInput = document.createElement("input");
      rotationInput.classList.add(
        "form-control",
        "w-auto",
        "mt-n2",
        "mr-2",
        "ml-1"
      );
      rotationInput.value = "0";
      rotationLabel.appendChild(rotationInput);
      inputGroupTransform.appendChild(rotationLabel);

      const xScaleLabel = document.createElement("label");
      xScaleLabel.classList.add("d-flex", "col-form-label");
      xScaleLabel.textContent = "X Scale:";
      const xScaleInput = document.createElement("input");
      xScaleInput.classList.add(
        "form-control",
        "w-auto",
        "mt-n2",
        "mr-2",
        "ml-1"
      );
      xScaleInput.value = "1";
      xScaleLabel.appendChild(xScaleInput);
      inputGroupTransform.appendChild(xScaleLabel);

      const yScaleLabel = document.createElement("label");
      yScaleLabel.classList.add("d-flex", "col-form-label");
      yScaleLabel.textContent = "Y Scale:";
      const yScaleInput = document.createElement("input");
      yScaleInput.classList.add(
        "form-control",
        "w-auto",
        "mt-n2",
        "mr-2",
        "ml-1"
      );
      yScaleInput.value = "1";
      yScaleLabel.appendChild(yScaleInput);
      inputGroupTransform.appendChild(yScaleLabel);
      this.element.appendChild(inputGroupTransform);

      [
        ...inputs,
        xInput,
        yInput,
        rotationInput,
        xScaleInput,
        yScaleInput,
      ].forEach((el) => {
        el.type = "number";
        el.addEventListener("change", () => {
          let params = [];
          const transfrom: Transform = new Transform(
            new Point(parseInt(xInput.value), parseInt(yInput.value)),
            parseInt(rotationInput.value),
            new Point(parseInt(xScaleInput.value), parseInt(yScaleInput.value))
          );
          if (!this.isEdit) {
            for (const input of inputs) {
              params[input.name] = input.value;
            }
            this.previewNode(this.shape, transfrom, params);
          } else {
            this.previewTranslate(transfrom);
          }
        });
      });

      const addBtn = document.createElement("btn");
      addBtn.classList.add("btn", "btn-primary");
      addBtn.innerText = "Save";
      addBtn.addEventListener("click", () => {
        let params = [];
        const transfrom: Transform = new Transform(
          new Point(parseInt(xInput.value), parseInt(yInput.value)),
          parseInt(rotationInput.value),
          new Point(parseInt(xScaleInput.value), parseInt(yScaleInput.value))
        );
        for (const input of inputs) {
          params[input.name] = input.value;
        }
        if (this.isEdit) {
          if (this.translate(transfrom)) {
            this.isEdit = false;
            this.render();
          }
        } else {
          if (this.createtNode(this.shape, transfrom, params)) {
            this.shape = null;
            this.render();
          }
        }
      });
      this.element.appendChild(addBtn);

      var event = new Event("change");
      xInput.dispatchEvent(event);
    }
  }
}

export class Controller implements IElement {
  private readonly drawingCanvas: DrawingCanvas;
  private readonly hierarchy: Hierarchy;
  private readonly creationForm: CreationForm;
  private readonly canvas: Canvas;
  private selectedNode: Shape;
  private previewNode: Shape;
  private isInEdit: boolean;
  private readonly element: HTMLDivElement;

  constructor(width: number = 640, height: number = 480) {
    this.element = document.createElement("div");
    this.element.classList.add("row", "mt-2");

    this.drawingCanvas = new DrawingCanvas(width, height, (point: Point) =>
      this.selectNodeAtPoint(point)
    );
    const canvasContainer = document.createElement("div");
    canvasContainer.classList.add("col-12", "col-md-8");
    canvasContainer.appendChild(this.drawingCanvas.getElement());
    this.element.appendChild(canvasContainer);

    this.hierarchy = new Hierarchy((node: Shape) => this.selectNode(node));
    const hierarhyContainer = document.createElement("div");
    hierarhyContainer.classList.add("col-12", "col-md-4");
    hierarhyContainer.appendChild(this.hierarchy.getElement());
    this.element.appendChild(hierarhyContainer);

    this.creationForm = new CreationForm(
      [Rectangle, Triangle, Circle],
      (type: any, transform: Transform, params: any) =>
        this.createNode(type, transform, params),
      (type: any, transform: Transform, params: any) =>
        this.preview(type, transform, params),
      () => this.removePreviewNode(),
      (translate: Transform) => this.translate(translate),
      (translate: Transform) => this.previewTranslate(translate)
    );
    const creationFormContainer = document.createElement("div");
    creationFormContainer.classList.add("col-12", "mt-2");
    creationFormContainer.appendChild(this.creationForm.getElement());
    this.element.appendChild(creationFormContainer);

    this.canvas = new Canvas(
      width,
      height,
      new Transform(new Point(width / 2, height / 2), 0, Point.unit)
    );
    this.selectedNode = null;
    this.previewNode = null;
    this.isInEdit = false;
    this.selectNode(this.canvas);
    this.render();
  }

  private selectNode(node: Shape): void {
    if (this.previewNode !== null || this.isInEdit) {
      alert("Please finish editing first!");
      return;
    }
    if (this.selectedNode !== null) {
      this.selectedNode.selected = false;
    }
    node.selected = true;
    this.selectedNode = node;
    this.render();
  }

  private selectNodeAtPoint(point: Point): void {
    console.log("hi");
    let currNode: Shape = this.canvas;
    let step = true;
    while (step) {
      step = false;
      for (const child of currNode.children) {
        if (child.isPointInside(point)) {
          currNode = child;
          step = true;
          break;
        }
      }
    }
    this.selectNode(currNode);
  }

  private removePreviewNode(): void {
    this.isInEdit = false;
    if (this.previewNode !== null) {
      this.previewNode.parent.removeChild(this.previewNode);
      this.previewNode = null;
    }
    this.render();
  }

  private preview(type: any, transform: Transform, params: any) {
    this.removePreviewNode();
    if (this.selectedNode === null) {
      alert("Please select node you want add new child to");
      return false;
    }

    const newNode = type.buildFromParams(this.selectedNode, transform, params);
    this.selectedNode.addChild(newNode);
    this.previewNode = newNode;
    this.render();
    return true;
  }

  private createNode(type: any, transform: Transform, params: any) {
    if (!this.previewNode.isStable()) {
      alert("New shape can't be placed here");
      return false;
    }
    this.removePreviewNode();
    if (this.selectedNode === null) {
      alert("Please select node you want add new child to");
      return false;
    }
    const newNode = type.buildFromParams(this.selectedNode, transform, params);
    this.selectedNode.addChild(newNode);
    this.render();
    return true;
  }

  private translate(translate: Transform) {
    if (this.selectedNode instanceof Canvas) return false;
    const prevTransform = this.selectedNode.transform;
    this.selectedNode.transform = this.selectedNode.transform.add(translate);
    this.render();
    if (this.selectedNode.isStable()) {
      this.isInEdit = false;
      return true;
    } else {
      this.selectedNode.transform = prevTransform;
      alert("Shape can't be placed here");
      return false;
    }
  }

  private previewTranslate(translate: Transform) {
    this.isInEdit = true;
    if (this.selectedNode instanceof Canvas) return;
    const prevTransform = this.selectedNode.transform;
    this.selectedNode.transform = this.selectedNode.transform.add(translate);
    this.render();
    this.selectedNode.transform = prevTransform;
  }

  getElement(): HTMLDivElement {
    return this.element;
  }

  render(): void {
    this.drawingCanvas.render(this.canvas);
    this.hierarchy.render(this.canvas);
  }
}

function getCursorPosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return new Point(x, y);
}

export class DrawingCanvas implements IElement {
  private readonly canvas: HTMLCanvasElement;
  private readonly canvasCtx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;

  constructor(
    width: number,
    height: number,
    selectNodeAtPoint: (point: Point) => void
  ) {
    this.width = width;
    this.height = height;

    this.canvas = document.createElement("canvas");
    this.canvasCtx = this.canvas.getContext("2d");
    this.canvas.setAttribute("width", width.toString());
    this.canvas.setAttribute("height", height.toString());
    this.canvas.classList.add("d-block", "m-auto", "align-self-center");
    this.canvas.addEventListener("mousedown", (e) => {
      selectNodeAtPoint(getCursorPosition(this.canvas, e));
    });
  }

  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  getCtx(): CanvasRenderingContext2D {
    return this.canvasCtx;
  }

  clear(): void {
    this.canvasCtx.clearRect(0, 0, this.width, this.height);
  }

  render(canvas: Canvas): void {
    this.clear();
    canvas.draw(this.canvasCtx, Point.zero, Transform.default);
  }
}

const main = document.getElementById("main");

const controller = new Controller();

main.appendChild(controller.getElement());

//controller.test();
