/* no tsconfig.json at design time available (default is used?), eslint is ok */
import { of, from, concat } from 'rxjs';
import { reduce, toArray, tap, map, catchError } from 'rxjs/operators';

import {
  csvParse,
  csvConvert,
  csvDropHeader,
  csvAssembler,
  csvInjectHeader,
  csvStringify,
  csvPropValues,
  csvFromArray,
  csvDropEmpty,
  csvValidateRecord,
  csvJustifier,
  csvDataConverter,
} from '../csv-rxjs-kit';

const sample1 = `aaa,bbb,ccc,ddd\u{D}
,,,\u{D}
 ll, m ,nn , \u{D}
"pp\u{D}qq\u{D}
rr""ss","""""","""","
\u{D}"\u{D}
\u{D}
xxx,yyy,zzz,",,,"`;

const sample2 = `aaa,bbb,ccc,ddd
,,,
 ll, m ,nn , 
"pp\u{D}qq\u{D}
rr""ss","""""","""","
\u{D}"

xxx,yyy,zzz,",,,"
`;

const data1 = [
  ['aaa', 'bbb', 'ccc', 'ddd'],
  ['', '', '', ''],
  [' ll', ' m ', 'nn ', ' '],
  ['pp\rqq\r\nrr"ss', '""', '"', '\n\r'],
  [],
  ['xxx', 'yyy', 'zzz', ',,,'],
];

const sample3 = `1,2,3

,0
,",","
"`;

const data3 = [[1, 2, 3], [], [undefined, 0], ['', ',', '\n']];

const verify1 = `1,2
x,x
,0
,","
`;

const verify2 = `1,2,3

,0,`;

const cnvA = `car,100,5
tree,2,10
cat,1,100`;

const cnvB = `total,name,owner
500,car,
20,tree,
100,cat,`;

test('Parser test', (done) => {
  concat(
    from(sample1).pipe(
      csvParse(),
      toArray(),
      tap((result) => expect(result).toStrictEqual(data1))
    ),
    of(sample1).pipe(
      csvParse(),
      toArray(),
      tap((result) => expect(result).toStrictEqual(data1))
    ),
    from(sample2).pipe(
      csvParse(),
      toArray(),
      tap((result) => expect(result).toStrictEqual(data1))
    ),
    of('bad"quote\n').pipe(
      csvParse(),
      catchError((e) => {
        expect(e).toStrictEqual(SyntaxError('CSV4180 [1, 4]: Quote in non-escaped data.'));
        return of(undefined);
      })
    ),
    of('"missing quote\n').pipe(
      csvParse(),
      catchError((e) => {
        expect(e).toStrictEqual(SyntaxError('CSV4180 [2, 1]: Closing quote is missing.'));
        return of(undefined);
      })
    ),
    of('"invalid"escape\n').pipe(
      csvParse(),
      catchError((e) => {
        expect(e).toStrictEqual(SyntaxError('CSV4180 [1, 10]: Invalid escape sequence.'));
        return of(undefined);
      })
    ),
    of(undefined).pipe(
      map(() => {
        throw 'no data';
      }),
      csvParse(),
      catchError((e) => {
        expect(e).toStrictEqual('no data');
        return of(undefined);
      })
    )
  ).subscribe({ complete: () => void done() });
});

test('Stringify test', (done) => {
  concat(
    from(data1).pipe(
      csvStringify(),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(sample1))
    ),
    from(data1).pipe(
      csvStringify({ delimiter: '\n', last_break: true }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(sample2))
    )
  ).subscribe({ complete: () => void done() });
});

test('Utilities test', (done) => {
  concat(
    from(data3).pipe(
      csvFromArray(),
      csvStringify({ delimiter: '\n' }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(sample3))
    ),
    from(data3).pipe(
      csvFromArray(),
      csvDropEmpty(),
      csvDropHeader(),
      csvInjectHeader([]),
      csvInjectHeader(['a', 'b', 'c']),
      csvStringify({ delimiter: '\n' }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(sample3.replace(/1,2,3/, 'a,b,c')))
    )
  ).subscribe({ complete: () => void done() });
});

test('Validator test', (done) => {
  concat(
    from(data3).pipe(
      csvFromArray(),
      csvValidateRecord(true, csvJustifier()),
      toArray(),
      catchError((e) => {
        expect(e).toStrictEqual(RangeError('Invalid record.'));
        return of(undefined);
      })
    ),
    from(data3).pipe(
      csvFromArray(),
      csvValidateRecord(false, csvJustifier({ length: 2, skip_empty: false, repair: true, filler: 'x' })),
      csvStringify({ delimiter: '\n', last_break: true }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(verify1))
    ),
    from(data3.slice(0, 3)).pipe(
      csvFromArray(),
      csvValidateRecord(true, csvJustifier({ length: 2, skip_empty: true, repair: true, filler: '' })),
      csvStringify({ delimiter: '\n' }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(verify2))
    ),
    from(['a,b,c', 'd,e', 'f,g,h,i'].map((r) => r.split(','))).pipe(
      csvValidateRecord(false, csvJustifier({ length: 2, repair: true })),
      csvDropEmpty(),
      toArray(),
      tap((result) => expect(result).toStrictEqual([['d', 'e']]))
    )
  ).subscribe({ complete: () => void done() });
});

test('Converter test', (done) => {
  const invalidConverter = (undefined as unknown) as csvDataConverter<unknown, unknown>;
  expect(() => csvConvert(true, invalidConverter)).toThrowError(RangeError('Data converter is not provided.'));
  concat(
    from(cnvA)
      .pipe(
        csvParse(),
        csvInjectHeader(['name', 'p']),
        csvConvert(true, csvAssembler('unk')),
        csvDropHeader(),
        map((o) => ({ ...o, total: Number(o.p) * Number(o['unk2']) }))
      )
      .pipe(
        csvInjectHeader(['total', 'name', 'owner']),
        csvConvert(true, csvPropValues()),
        csvStringify({ delimiter: '\n' }),
        reduce((csv, line) => csv + line, ''),
        tap((result) => expect(result).toStrictEqual(cnvB))
      ),
    from([['field'], ['a', 'b', 'c']]).pipe(
      csvConvert(
        true,
        csvAssembler((i) => `f${i}`)
      ),
      csvDropHeader(),
      tap((result) => expect(result).toStrictEqual({ field: 'a', f1: 'b', f2: 'c' }))
    ),
    of(['a', 'b', 'c']).pipe(
      csvConvert(false, csvAssembler()),
      tap((result) => expect(result).toStrictEqual({ _0: 'a', _1: 'b', _2: 'c' }))
    ),
    of({ t: 0, z: 'text', c: undefined }).pipe(
      csvConvert(false, csvPropValues(true)),
      tap((result) => expect(result).toStrictEqual(['', '0', 'text']))
    )
  ).subscribe({ complete: () => void done() });
});
