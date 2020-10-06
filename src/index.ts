class Stream<T> {
  private constructor(private readonly source: Iterator<T>) {}

  static of<T>(source: Iterable<T> | Iterator<T>): Stream<T> {
    const iterator = isIterable(source) ? source[Symbol.iterator]() : source;
    return new Stream(iterator);
  }

  map<U>(mapper: (x: T) => U): Stream<U> {
    const source = this.source;
    return new Stream(
      (function* () {
        let current = source.next();
        while (!current.done) {
          yield mapper(current.value);
          current = source.next();
        }
      })()
    );
  }

  filter(predicate: (x: T) => boolean): Stream<T> {
    const source = this.source;
    return new Stream(
      (function* () {
        let current = source.next();
        while (!current.done) {
          if (predicate(current.value)) {
            yield current.value;
          }
          current = source.next();
        }
      })()
    );
  }

  collect(): Array<T> {
    const arr = [];
    let current = this.source.next();
    while (!current.done) {
      arr.push(current.value);
      current = this.source.next();
    }
    return arr;
  }

  first(): T | null {
    let first = this.source.next();
    return !first.done ? first.value : null;
  }
}

function isIterable<T>(
  subject: Iterable<T> | Iterator<T>
): subject is Iterable<T> {
  return true;
}

// ----

function sequence(length: number): Array<number> {
  return Array.from({ length }, (_, i) => i + 1);
}

const size = 1000000;
const source = sequence(size);

const before = Date.now();
const result = Stream.of(source)
  .map((x) => x * 2)
  .filter((x) => x > 4)
  .first();
//const result = source.map((x) => x * 2).filter((x) => x > 4)[0];
const time = Date.now() - before;

console.log("Result", result, "Time", time);
