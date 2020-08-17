# csv-rxjs-kit

A toolkit of RxJS operators to handle CSV formatted data ([RFC 4180](https://tools.ietf.org/html/rfc4180)).

[![Build Status](https://travis-ci.com/Gadicuz/csv-rxjs-kit.svg?branch=master)](https://travis-ci.com/Gadicuz/csv-rxjs-kit)
[![Coverage Status](https://coveralls.io/repos/github/Gadicuz/csv-rxjs-kit/badge.svg?branch=master)](https://coveralls.io/github/Gadicuz/csv-rxjs-kit?branch=master)
[![npm](https://img.shields.io/npm/v/csv-rxjs-kit)](https://www.npmjs.com/package/csv-rxjs-kit)
[![rxjs](https://img.shields.io/github/package-json/dependency-version/gadicuz/csv-rxjs-kit/dev/rxjs)](https://www.npmjs.com/package/rxjs)
[![Code Size](https://img.shields.io/github/languages/code-size/gadicuz/csv-rxjs-kit)](https://github.com/gadicuz/csv-rxjs-kit)
[![Top Language](https://img.shields.io/github/languages/top/gadicuz/csv-rxjs-kit)](https://github.com/gadicuz/csv-rxjs-kit)
[![MIT License](https://img.shields.io/github/license/gadicuz/csv-rxjs-kit)](https://github.com/Gadicuz/csv-rxjs-kit/blob/master/LICENSE)


# Features

* Parses and generates CSV formatted text
* CSV format support (fully compliant with [RFC 4180](https://tools.ietf.org/html/rfc4180))
  * fields delimiter: <code>,</code>
  * quote: <code>"</code>
  * line breaks:  <code>CRLF</code> (default) , <code>LF</code> , <code>CR</code> (parsing only)
* Simple API (a handful of RxJS operators)
* Modular design to perfectly fulfill custom requirements
* Compatible with standard [RxJS 6](https://github.com/ReactiveX/rxjs/tree/6.x) data processing
* ECMAScript module, typings available


# Install

```bash
npm i csv-rxjs-kit
```

# Usage

The package consists of several simple RxJS operators specific to CSV data processing (text parsing/generating, CSV header manipulation, CSV data records validation) and some utility functions.

All those CSV operators are intended to combine with standard RxJS operators to build up required functionality.

## CSV records

The main data type for the operators is the CSV record:
```typescript
type csvRecord = string[];
```

The very first CSV record in a data stream might be a header record. The header record consists of field names (instead of field data) for the following CSV records. The header record can be used to construct Objects with well-named properties or (obviously) to create a CSV text file with a header. One can remove and add an arbitrary header to the data stream.

Empty CSV records are prohibited in CSV files but operators `csvParse()` and `csvStringify()` allow them. If one needs to get rid of them after parsing or before stringify, they can use `csvDropEmpty()` operator.

The package provides basic CSV records verification functionality. RFC 4180 requires all CSV records to be the same length. The validation ensures this and throws an error by default. There are options to change the default validation behaviour to erase, ignore or repair invalid records.


## RxJS operators

The package provides several specific operators to produce, handle and consume CSV records.

* Operators to produce CSV records:
  * `csvParse()` parses CSV formatted text
  * `csvConvert()` (with `csvExtractor` helper) extracts data from Object's properties
  * `csvFromArray()` convert arrays of any data

* Operators for CSV records conversion to other data formats:
  * `csvStringify()` produces CSV formatted text
  * `csvConvert()` (with `csvBuilder` helper) creates Objects

* Operators to handle CSV records:
  * `csvDropEmpty()` removes empty records from the records stream
  * `csvDropHeader()` removes the header (first) record from the records stream
  * `csvInjectHeader()` insert a new header record to the data stream
  * `csvValidateRecord()` (with `csvRecordValidator` helper) validates (modifies) records

Every CSV record is an array of strings so one can also use [standard RxJS operators](https://rxjs-dev.firebaseapp.com/operator-decision-tree) to process CSV records.

The most dependent on RFC 4180 operators in the package are `csvParse()` and `csvStringify()`. Other operators are intended to handle the CSV record stream and implement required application functionality. They can be replaced by combinations of standard RxJS operators.

## Helper functions

The package provides some functions to handle CSV records.

* Validation functions:
  * `csvJustifier()` returns helper function, that adjusts record's length or removes invalid records.
* Processing functions:
  * `csvPropNames()` returns Object's property names as a header record.
  * `csvPropValues()` returns helper function, that creates a record for Object's properties values.
  * `csvAssembler()` returns helper function, that creates an Object with properties initialized by a record's values.

# Examples

### Convert CSV data to JSON formatted objects

```typescript
// input CSV text data (with headers)
const data$: Observable<string> = ...; 

data$.pipe(
  csvParse(), // convert to CSV records 
  csvDropEmpty(), // remove empty CSV records 
  csvValidateRecord(true, csvJustifier()), // validate records
  csvConvert(true, csvObjAssemble()), // convert CSV record to object
  map((objects) => JSON.stringify(objects)) // generate CSV
) // <- Observable<string>, JSON formatted input CSV records
```

### Convert an array of unknown data to CSV text with an arbitrary header

```typescript
const data$: Observable<unknown[]> = ...; // input arrays
const names: string[] = ...; // field names

data$.pipe(
  csvFromArray(), // don't need this for string arrays
  csvInjectHeader(names), // inject field names
  csvStringify({ delimiter: '\n', last_break: true }) // generate CSV
) // <- Observable<string>, CSV formatted text
```

### Insert a new first column calculated as sum of all field values

```typescript
const data$: Observable<string> = ...; // input CSV text data

data$.pipe(
  csvParse(),
  map((rec) => {
    const sum = rec.reduce((acc, v) => +v + acc, 0);
    rec.unshift(sum);
    return rec;
  }),
  csvStringify()
) // <- Observable<string>, CSV formatted text
```
