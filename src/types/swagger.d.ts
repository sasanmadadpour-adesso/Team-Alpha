declare module '@nestjs/swagger' {
  export class DocumentBuilder {
    setTitle(title: string): this;
    setVersion(version: string): this;
    build(): object;
  }
  export class SwaggerModule {
    static createDocument(app: unknown, config: object): object;
    static setup(path: string, app: unknown, document: object): void;
  }
  export function ApiHeader(options: object): MethodDecorator & ClassDecorator;
  export function ApiOperation(options: object): MethodDecorator;
  export function ApiTags(...tags: string[]): ClassDecorator;
}
