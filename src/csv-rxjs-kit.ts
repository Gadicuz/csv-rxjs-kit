import { Observable, OperatorFunction, MonoTypeOperatorFunction } from 'rxjs';
import { map, skip, filter, startWith, endWith } from 'rxjs/operators';

/** Basic CSV-record.
 *
 * `csvRecord` datatype represents single MIME Type 'text/csv' [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt) data record.
 * Any first record of a CSV-record stream might be header record.
 *
 * Every CSV-record just an array of string. Every empty field is an empty string. Empty records are empty arrays.
 */
export type csvRecord = string[];

/** CSV data converter function type.
 * @typeParam T - source data type
 * @typeParam R - result data type
 * @param src - source data object
 * @param names - field names form header record
 */
export type csvDataConverter<T, R> = (src: T, names?: string[]) => R;

/**
 * CSV-record validator function type.
 * @param csvRecord - CSV-record to validate
 * @param isHeader - CSV-record type
 * @returns validated CSV-record
 * @throws any validation errors
 */
export type csvRecordValidator = (rec: csvRecord, isHeader: boolean) => csvRecord;

/**
 * Field names extractor funcion type.
 * @typeParam T - object type
 * @param obj - object to exctract names
 * @returns field names
 */
export type csvHeaderExtractor<T> = (obj: T) => string[];

/** Object builder function type. */
export type csvObjectBuilder<T> = csvDataConverter<csvRecord, T>;

/** CSV-record extractor function type. */
export type csvRecordExtractor<T> = csvDataConverter<T, csvRecord>;

/**
 * CSV formatter RxJS operator.
 *
 * Returns an Observable that converts to text every `csvRecord` emitted by source Observable.
 * Output text data is formatted as MIME Type 'text/csv' [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt).
 *
 * Parameter `opt.delimiter` sets line breaks type, default is `CRLF`.
 *
 * Parameter `opt.last_break` adds optional line delimiter after the last record.
 *
 * Parameter `opt.force_quote` adds quotation to every item.
 *
 * @param opt - options
 */
export function csvStringify(opt?: {
  delimiter?: '\r\n' | '\n';
  last_break?: boolean;
  force_quote?: boolean;
}): OperatorFunction<csvRecord, string> {
  const eol = opt?.delimiter || '\r\n';
  const quote = opt?.force_quote;
  const line$: OperatorFunction<csvRecord, string> = map(
    (r, i) =>
      (i ? eol : '') +
      r.map((field) => (quote || /[,"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join(',')
  );
  return opt?.last_break ? (data$) => data$.pipe(line$, endWith(eol)) : line$;
}

/**
 * CSV parser RxJS operator.
 *
 * Returns an Obsrevable that parses text emitted by source Observable and converts it to `csvRecord`s.
 * Input text should be MIME Type 'text/csv' as described is [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt).
 *
 * All parse errors are reported as `SyntaxError` using an Observer's `error()` method.
 */
export function csvParse(): OperatorFunction<string, csvRecord> {
  return function (csv$: Observable<string>): Observable<csvRecord> {
    return new Observable((observer) => {
      type S =
        | 'IDLE' // start of a line
        | 'COMMA' // right after ','
        | 'CR' // right after <CR>
        | 'TEXT' // inside non-escaped text
        | 'ESCAPED' // inside escaped text
        | 'CLOSED' // after '"' inside escaped text
        | undefined; // observable closed, no more activity
      const R = new RegExp(/,|"|\n|\r\n|\r|[^,"\r\n]+/y);
      let state: S = 'IDLE';
      let r: csvRecord = [];
      let v = '';
      let rIndex = 1;
      let cIndex = 1;
      let lastToken = '';
      function err(msg: string): void {
        state = undefined;
        observer.error(new SyntaxError(`CSV4180 [${rIndex}, ${cIndex}]: ` + msg));
      }
      function next(): void {
        observer.next(r);
        r = [];
      }
      function fsm(s: string | undefined): boolean {
        if (s === undefined) return false;
        switch (state) {
          case 'IDLE':
          case 'CR':
            switch (s) {
              case ',':
                r.push('');
                state = 'COMMA';
                break;
              case '"':
                state = 'ESCAPED';
                break;
              case '\r':
              case '\r\n':
                next();
                state = s === '\r' ? 'CR' : 'IDLE';
                break;
              case '\n':
                if (state === 'CR') state = 'IDLE';
                else next();
                break;
              case '':
                break;
              default:
                v += s;
                state = 'TEXT';
                break;
            }
            break;
          case 'COMMA':
            switch (s) {
              case ',':
                r.push('');
                break;
              case '"':
                state = 'ESCAPED';
                break;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push('');
                next();
                state = s === '\r' ? 'CR' : 'IDLE';
                break;
              default:
                v += s;
                state = 'TEXT';
                break;
            }
            break;
          case 'TEXT':
            switch (s) {
              case ',':
                r.push(v);
                v = '';
                state = 'COMMA';
                break;
              case '"':
                err('Quote in non-escaped data.');
                return false;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push(v);
                v = '';
                next();
                state = s === '\r' ? 'CR' : 'IDLE';
                break;
              default:
                v += s;
                break;
            }
            break;
          case 'ESCAPED':
            if (s === '"') state = 'CLOSED';
            else if (s === '') {
              err('Closing quote is missing.');
              return false;
            } else v += s;
            break;
          case 'CLOSED':
            switch (s) {
              case ',':
                r.push(v);
                v = '';
                state = 'COMMA';
                break;
              case '"':
                v += s;
                state = 'ESCAPED';
                break;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push(v);
                v = '';
                next();
                state = s === '\r' ? 'CR' : 'IDLE';
                break;
              default:
                err('Invalid escape sequence.');
                return false;
            }
            break;
          default:
            return false;
        }
        if (s[0] === '\r' || (s === '\n' && lastToken !== '\r')) {
          rIndex++;
          cIndex = 1;
        } else cIndex += s.length;
        lastToken = s;
        return true;
      }
      return csv$.subscribe({
        next(chunk: string): void {
          if (state) while (fsm(R.exec(chunk)?.[0]));
        },
        complete(): void {
          if (state && fsm('')) observer.complete();
          state = undefined;
        },
        error(e: unknown): void {
          if (state) observer.error(e);
          state = undefined;
        },
      });
    });
  };
}

/**
 * Removes empty records.
 *
 * Returns an Observable that removes all empty records emitted by source Observable.
 */
export function csvDropEmpty(): MonoTypeOperatorFunction<csvRecord> {
  return filter((r) => !!r.length);
}

/**
 * Removes header record.
 *
 * Returns an Observable that removes header `csvRecord` (the first data item) emitted by source Observable.
 * There is no dedicated tagging for header `csvRecord` so one must be sure the source Observable emits header.
 *
 * @typeParam T - the main data type, might be csvRecord or any arbitrary data type
 */
export function csvDropHeader<T>(): OperatorFunction<T | csvRecord, T> {
  return skip(1) as OperatorFunction<T | csvRecord, T>;
}

/**
 * Injects a header record.
 *
 * Returns an Observable that emits header record and then mirrors source Observable.
 * Inserted `csvRecord` will be interpreted as a header `csvRecord` by other operators if they are instructed to.
 *
 * @typeParam T - the main stream type
 * @param header - header record value
 */
export function csvInjectHeader<T>(header: csvRecord): OperatorFunction<T, T | csvRecord> {
  return startWith(header);
}

/**
 * Validates a record.
 *
 * Returns an Observable that uses `validator` to check/modify every `csvRecord` emitted by source Observable.
 *
 * To remove invalid records one can use `validator` to convert them to empty records and then use `csvDropEmpty` operator.
 *
 * @param hdr - does source Obsrvable emit header 'csvRecord'?
 * @param validator - function to validate a 'csvRecord'
 * @throws everything that `validator` throws
 */
export function csvValidateRecord(hdr: boolean, validator: csvRecordValidator): MonoTypeOperatorFunction<csvRecord> {
  return map((r, i) => validator(r, hdr && !i));
}

/**
 * Creates `csvRecord` for data array.
 *
 * Returns an Observable that converts every array item emitted by source Observable to `csvRecord`.
 * The operator calls `String(...)` for every defined item in the input data array, undefined items are replaced by `''`.
 *
 * It doesn't matter if source Observable emits header record. The operator's conversion procedure doesn't affect a header record.
 *
 * If you need different behavior and/or have different input data type use `csvConvert()` and custom `csvRecordExtractor<T>`.
 */
export function csvFromArray(): OperatorFunction<unknown[], csvRecord> {
  return map((obj) => obj.map((v) => String(v ?? '')));
}

/**
 * Converts an item using provided data converter function, uses header record to extract names.
 *
 * Returns an Observable that uses `prj` function to convert items emitted by source Observable.
 *
 * If `hdr === true` the operator interprets first item emitted by source Observable as a header record
 * and uses the record's data as names in subsequent `prj` calls.
 * The header records is reemitted, don't forget to remove it to clean up the data item stream.
 *
 * If `hdr === false` no names available to `prj` function and every record emitted by source Observable is converted.
 *
 * @typeParam T - input object type
 * @typeParam R - output object type
 * @param hdr - does source Observable emit header 'csvRecord'?
 * @param prj - function to convert object
 * @throws `RangeError` if `prj` argument is invalid
 */
export function csvConvert<T, R>(hdr: false, prj: csvDataConverter<T, R>): OperatorFunction<T, R>;
export function csvConvert<T, R>(
  hdr: true,
  prj: csvDataConverter<T, R>
): OperatorFunction<csvRecord | T, csvRecord | R>;
export function csvConvert<T, R>(
  hdr: boolean,
  prj: csvDataConverter<T, R>
): OperatorFunction<T, R> | OperatorFunction<csvRecord | T, csvRecord | R> {
  if (!prj) throw new RangeError('Data converter is not provided.');
  if (!hdr) return map<T, R>((rec) => prj(rec));
  return map<csvRecord | T, csvRecord | R>(
    (() => {
      let names: string[] | undefined = undefined;
      return (obj: csvRecord | T, i: number) => {
        if (i !== 0) return prj(obj as T, names);
        names = obj as string[];
        return obj as csvRecord;
      };
    })()
  );
}

/**
 * Justifies record length, can be is used with `csvValidateRecord()`.
 *
 * Returns `csvRecordValidator` that justifies record length according to header length.
 * According to RFC 4180 'each line should contain the same number of fields throughout the file'
 * hence any changes to bad sized records violate the RFC.
 *
 * Parameter `opt.length` sets default length of a record. A header record length (if available)
 * overrides `opt.length` value. If `opt.length` is not set and header record hasn't been available,
 * no records are altered.
 *
 * Parameter `opt.skip_empty` instructs to skip empty records, **violates RFC 4180**
 *
 * Parameter `opt.repair` instructs to repair bad sized records, **violates RFC 4180**
 *
 * Parameter `opt.filler` sets repair mode. If `opt.filler` is defined bad sized record is filled up
 * or cut to the header length. If `opt.filler` is undefined invalid record is replaced with an empty record.
 *
 * @param opt - validation options
 */
export function csvRecordsJustifier(opt?: {
  length?: number;
  skip_empty?: boolean;
  repair?: boolean;
  filler?: string;
}): csvRecordValidator {
  let hlen = opt?.length;
  const skip_empty = opt?.skip_empty;
  const repair = opt?.repair;
  const filler = opt?.filler;
  return (rec: csvRecord, isHeader: boolean) => {
    const rlen = rec.length;
    if (isHeader) hlen = rlen;
    if (hlen !== undefined && hlen !== rlen && (rlen != 0 || !skip_empty)) {
      if (!repair) throw RangeError('Invalid record.');
      if (filler == undefined) return [];
      if (rlen < hlen) {
        rec.length = hlen;
        rec.fill(filler, rlen);
      } else rec.length = hlen;
    }
    return rec;
  };
}

/**
 * Creates an object upon `csvRecord`.
 *
 * Returns `csvObjectBuilder<Record<string, string>>` that creates an object using properties names array and `rec` data as values.
 * Every data item in `csvRecords` is added to created object. Data item index is used to select property name in `names` array.
 * If no such name exists then argument `extra` is used to generate property name for index `i`.
 *
 * If `extra` is function, then propery name is `<extra>(<i>)`.
 * If `extra` is string, then property name is `<extra><i>`.
 * If `extra` is undefined, then property name is `_<i>`.
 *
 * Can be used in `csvConvert()` to create simple objects.
 *
 * @see csvConvert()
 *
 * @param extra - property name generator for unlisted properties
 */
export function csvObjAssembler(
  extra?: string | ((index: number) => string)
): csvObjectBuilder<Record<string, string>> {
  const n =
    typeof extra === 'function'
      ? extra
      : typeof extra === 'string'
      ? (i: number) => `${extra}${i}`
      : (i: number) => `_${i}`;
  return (rec: csvRecord, names?: string[]) => {
    const fields = names || [];
    return Object.assign({}, ...rec.map((v, i) => ({ [fields[i] || n(i)]: v }))) as Record<string, string>;
  };
}

/** Returns an array of alphabetically sorted enumerable properties of an object. */
export function csvObjPropsGetter(): csvHeaderExtractor<Record<string, unknown>> {
  return (obj: Record<string, unknown>) => Object.keys(obj).sort((a, b) => a.localeCompare(b));
}

/**
 * Creates an CSV record upon object.
 *
 * Returns `csvRecordExtractor<Record<string, unknown>>` that creates an CSV record using properties names array and `obj` as values.
 * Every listed on `names` property's value is received from `obj` and stored in the record. Undefined values replaced by `''`.
 * If `extra === true` all non listed object properties values are added to the record in alphabetical order after the listed ones.
 *
 * @param extra - add non listed properties values
 */
export function csvObjValuesGetter(extra?: boolean): csvRecordExtractor<Record<string, unknown>> {
  return (obj: Record<string, unknown>, names?: string[]) => {
    let listed = names || [];
    if (extra) listed = listed.concat(csvObjPropsGetter()(obj).filter((k) => !listed.includes(k)));
    return listed.map((k) => String(obj[k] ?? ''));
  };
}
