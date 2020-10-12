export class Stream<T> implements StreamPipeOperations<T>, StreamTerminalOperations<T> {
  private constructor(
    private readonly lazyStream: LazyStream<T>,
    private readonly eagerStream?: EagerStream<T>,
  ) { }

  static from<T>(source: Iterable<T>): Stream<T>;
  static from<T>(source: Iterator<T>): Stream<T>;
  static from<T>(source: GeneratorFunction<T>): Stream<T>;
  static from<T>(source: Iterable<T> | Iterator<T> | GeneratorFunction<T>) {
    if (isIterable(source)) {
      if (isArray(source)) {
        return new Stream(
          LazyStream.from(source),
          EagerStream.from(source)
        );
      }
      return new Stream(LazyStream.from(source));
    }

    if (isIterator(source)) {
      return new Stream(LazyStream.from(source));
    }

    if (isGeneratorFunction(source)) {
      return new Stream(LazyStream.from(source));
    }

    throw new Error(`${source} is not a valid source for ${this.prototype}`);
  }

  map<U>(mapper: Mapper<T, U>): StreamOperations<U> {
    return this.newStream(
      this.lazyStream.map(mapper),
      this.eagerStream?.map(mapper)
    );
  }

  filter(predicate: Predicate<T>): StreamOperations<T> {
    return this.newStream(
      this.lazyStream.filter(predicate),
      this.eagerStream?.filter(predicate)
    );
  }

  collect<U, C extends Iterable<U>>(collector: Collector<T, U, C>): C {
    return this.eagerStream
      ? this.eagerStream.collect(collector)
      : this.lazyStream.collect(collector);
  }

  first(): Optional<T> {
    return this.lazyStream.first();
  }

  private newStream<U>(lazyStream: StreamOperations<U>, eagerStream?: StreamOperations<U>) {
    return new Stream(
      lazyStream as LazyStream<U>,
      eagerStream as EagerStream<U> | undefined
    );
  }
}

export class LazyStream<T> implements StreamPipeOperations<T>, StreamTerminalOperations<T> {
  private constructor(private readonly source: Iterable<T>) { }

  static from<T>(source: Iterable<T>): LazyStream<T>;
  static from<T>(source: Iterator<T>): LazyStream<T>;
  static from<T>(source: GeneratorFunction<T>): LazyStream<T>;
  static from<T>(source: Iterable<T> | Iterator<T> | GeneratorFunction<T>) {
    if (isIterable(source)) {
      return new LazyStream(source);
    }

    if (isIterator(source)) {
      const iterable = {
        [Symbol.iterator]() {
          return source;
        }
      };
      return new LazyStream(iterable);
    }

    if (isGeneratorFunction(source)) {
      const generator = source();
      return LazyStream.from(generator); // matches the iterator case
    }

    throw new Error(`${source} is not a valid source for ${this.prototype}`);
  }

  static of<T>(...items: Array<T>): LazyStream<T> {
    return new LazyStream(items);
  }

  map<U>(mapper: Mapper<T, U>): StreamOperations<U> {
    const source = this.source;
    return LazyStream.from(function* () {
      for (const item of source) {
        yield mapper(item);
      }
    });
  }

  filter(predicate: Predicate<T>): StreamOperations<T> {
    const source = this.source;
    return LazyStream.from(function* () {
      for (const item of source) {
        if (predicate(item)) {
          yield item;
        }
      }
    });
  }

  collect<U, C extends Iterable<U>>(collector: Collector<T, U, C>): C {
    return collector(this.source);
  }

  first(): Optional<T> {
    const iterator = this.source[Symbol.iterator]();
    const firstItem = iterator.next();
    return Optional.ofNullable(!firstItem.done ? firstItem.value : null);
  }
}

export class EagerStream<T> implements StreamPipeOperations<T>, StreamTerminalOperations<T> {
  private constructor(private readonly arrayProducer: Producer<Array<T>>) { }

  static from<T>(source: Array<T>): EagerStream<T> {
    return new EagerStream(() => source);
  }

  static of<T>(...items: Array<T>): EagerStream<T> {
    return new EagerStream(() => items);
  }

  map<U>(mapper: Mapper<T, U>): StreamOperations<U> {
    return new EagerStream(() => this.arrayProducer().map(mapper));
  }

  filter(predicate: Predicate<T>): StreamOperations<T> {
    return new EagerStream(() => this.arrayProducer().filter(predicate));
  }

  collect<U, C extends Iterable<U>>(collector: Collector<T, U, C>): C {
    return collector(this.arrayProducer());
  }

  first(): Optional<T> {
    const firstItem = this.arrayProducer()[0];
    return Optional.ofNullable(firstItem ? firstItem : null);
  }
}

export class Optional<T> {
  constructor(private readonly value: T | null | undefined) { }

  static of<T>(value: T) {
    return new Optional(value);
  }

  static ofNullable<T>(value: T | null | undefined) {
    return new Optional(value);
  }

  isPresent() {
    return this.value !== null && this.value !== undefined;
  }

  /**
   * Unsafe operation, only call after type-guard isPresent
   */
  get() {
    return this.value as T;
  }

  getOrElse<U>(alternative: Producer<U>) {
    return this.isPresent() ? this.get() : alternative();
  }
}

function isIterable<T>(value: unknown): value is Iterable<T> {
  return typeof value === 'object' && value !== null &&
    typeof value[Symbol.iterator as keyof object] === 'function';
}

function isIterator<T>(value: unknown): value is Iterator<T> {
  return typeof value === 'object' && value !== null &&
    typeof value['next' as keyof object] === 'function';
}

function isGeneratorFunction<T>(value: unknown): value is GeneratorFunction<T> {
  if (typeof value === 'function') {
    const maybeGenerator = value();
    return isGenerator<T>(maybeGenerator);
  }
  return false;
}

function isArray<T>(subject: unknown): subject is Array<T> {
  return Array.isArray(subject);
}

function isGenerator<T>(value: unknown): value is Generator<T> {
  return typeof value === 'object' && value !== null &&
    typeof value['next' as keyof object] === 'function' &&
    typeof value['return' as keyof object] === 'function' &&
    typeof value['throw' as keyof object] === 'function' &&
    typeof value[Symbol.iterator as keyof object] === 'function';
}

interface StreamPipeOperations<T> {
  map<U>(mapper: Mapper<T, U>): StreamOperations<U>;
  filter(predicate: Predicate<T>): StreamOperations<T>;
}

interface StreamTerminalOperations<T> {
  // double definition to counter some weird TS bug
  // https://github.com/Microsoft/TypeScript/issues/30071#issue-413837242
  collect<U, C extends Iterable<U>>(collector: Collector<T, U, C>): C;
  collect<U, C extends Iterable<U>>(collector: Collector<T, U, C>): C;
  first(): Optional<T>;
}

type StreamOperations<T> = StreamPipeOperations<T> & StreamTerminalOperations<T>;

interface Mapper<T, U> {
  (input: T): U;
}

interface Predicate<T> {
  (input: T): boolean;
}

interface Producer<T> {
  (): T;
}

interface GeneratorFunction<T> {
  (): Generator<T>;
}

interface Collector<T, U, C extends Iterable<U>> {
  (iterable: Iterable<T>): C;
}

export class Collectors {
  static toArray<T>(iterable: Iterable<T>) {
    return Array.isArray(iterable)
      ? iterable as Array<T>
      : Array.from(iterable);
  }

  static toMap<T, K, V>(
    keyMapper: (item: T) => K,
    valueMapper: (item: T) => V
  ): (iterable: Iterable<T>) => Map<K, V> {
    return iterable => {
      // const entries: [K, V][] = [];
      // for (const item of iterable) {
      //   const key = keyMapper(item);
      //   const value = valueMapper(item);

      //   entries.push([key, value]);
      // }
      // return new Map(entries);
      return new Map(Stream.from(iterable)
        .map<[K, V]>(item => [keyMapper(item), valueMapper(item)])
        .collect(Collectors.toArray));
    };
  }
}

// ----------------------------------------------------------------------------

function sequence(length: number): Array<number> {
  return Array.from({ length }, (_, i) => i + 1);
}

const size = 1_000_000;
const source = sequence(size);

const before = Date.now();

const result = Stream.from(source)
  .map(x => x * 2)
  .filter(x => x > 4)
  .first()
  .getOrElse(() => { throw new Error('No value available') });

// const result = Stream.from(source)
//   .map(x => x * 2)
//   .collect(Collectors.toArray);

// const result = source.map(x => x * 2).filter(x => x > (2 * size - 1))[0];

const time = Date.now() - before;

console.log("Result", result, "Time", time);

