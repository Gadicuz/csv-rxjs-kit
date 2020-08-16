import { of, from, concat } from 'rxjs';
import { reduce, toArray, tap, map, catchError } from 'rxjs/operators';

import {
  csvParse,
  csvConvert,
  csvDropHeader,
  csvObjAssembler,
  csvInjectHeader,
  csvStringify,
  csvObjValuesGetter,
  csvFromArray,
  csvDropEmpty,
  csvValidateRecord,
  csvRecordsJustifier,
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
      csvValidateRecord(true, csvRecordsJustifier()),
      toArray(),
      catchError((e) => {
        expect(e).toStrictEqual(RangeError('Invalid record.'));
        return of(undefined);
      })
    ),
    from(data3).pipe(
      csvFromArray(),
      csvValidateRecord(false, csvRecordsJustifier({ length: 2, skip_empty: false, repair: true, filler: 'x' })),
      csvStringify({ delimiter: '\n', last_break: true }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(verify1))
    ),
    from(data3.slice(0, 3)).pipe(
      csvFromArray(),
      csvValidateRecord(true, csvRecordsJustifier({ length: 2, skip_empty: true, repair: true, filler: '' })),
      csvStringify({ delimiter: '\n' }),
      reduce((csv, line) => csv + line, ''),
      tap((result) => expect(result).toStrictEqual(verify2))
    )
  ).subscribe({ complete: () => void done() });
});

test('Converter test', (done) => {
  concat(
    from(cnvA)
      .pipe(
        csvParse(),
        csvInjectHeader(['name', 'p']),
        csvConvert(true, csvObjAssembler('unk')),
        csvDropHeader(),
        map((o) => ({ ...o, total: Number(o.p) * Number(o['unk2']) }))
      )
      .pipe(
        csvInjectHeader(['total', 'name', 'owner']),
        csvConvert(true, csvObjValuesGetter()),
        csvStringify({ delimiter: '\n' }),
        reduce((csv, line) => csv + line, ''),
        tap((result) => expect(result).toStrictEqual(cnvB))
      )
  ).subscribe({ complete: () => void done() });
});
