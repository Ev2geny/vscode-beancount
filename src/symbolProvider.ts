import { get } from "http";
import * as vscode from "vscode";

interface BlockData {
  name: string;
  level: number;
  kind: vscode.SymbolKind;
  start: vscode.TextLine;
  end: vscode.TextLine;
}

class LevelDocumentSymbol extends vscode.DocumentSymbol {
  level: number;

  constructor(
    name: string,
    detail: string,
    kind: vscode.SymbolKind,
    range: vscode.Range,
    selectionRange: vscode.Range,
    level: number
  ) {
    super(name, detail, kind, range, selectionRange);
    this.level = level;
  }
}


class SymbolsHolder {
  lastSymbolsPerLevel: LevelDocumentSymbol[];
  allRootSymbols: LevelDocumentSymbol[] = [];
  constructor() {
    this.lastSymbolsPerLevel = [];
    this.allRootSymbols = [];
  }

  addSymbol(symbol: LevelDocumentSymbol) {
    
    if (symbol.level < 1) {
      throw new Error("Symbol level should be greater than 0");
    }
    
    if (symbol.level === 1) {
      this.allRootSymbols.push(symbol);
      this.lastSymbolsPerLevel = [symbol];
      return;
    } 

    let diffWithLastLevel: number = symbol.level - this.lastSymbolsPerLevel.length;
    
    /*
    Here looking at the situation like this:

    *     1     level 1
    * *   1.2   level 2
    * * * 1.2.1 level 3   <= previous level 
    * *   1.3   level 2   <= current level
    
    Or like this:
    
    *     1     level 1
    * *   1.2   level 2
    * * * 1.2.1 level 3   <= previous level 
    * *   1.2.2 level 2   <= current level
    */
    if (diffWithLastLevel <= 0 ) {
      // Push this symbol as a child of the last symbol with the level one level up the hierarchy 
      // (which means one level lower in terms of the level number)
      // Since the 1st element of array keeps the level 1, but has an index 0, we need to subtract 2 from the level
      this.lastSymbolsPerLevel[symbol.level - 2].children.push(symbol);

      // Now we make the array to be the same length as the level
      this.lastSymbolsPerLevel = this.lastSymbolsPerLevel.slice(0, symbol.level);
      // finally we update the symbol being added as the last symbol for this level
      this.lastSymbolsPerLevel[symbol.level - 1] = symbol;
      return;
    }

    /*
    Here looking at the situation like this:

    *     1     level 1   <= previous level 
    * *   1.2   level 2   < = current level
    */
    if (diffWithLastLevel == 1 ) {
      // Push this symbol as a child of the last symbol with the level one level up the hierarchy 
      // (which means one level lower in terms of the level number)
      this.lastSymbolsPerLevel[symbol.level - 2].children.push(symbol);
      // Extend the array with the new symbol, as the new symbol has the level with the number, 1 bigger than the last one
      this.lastSymbolsPerLevel.push(symbol);
    }

    if (diffWithLastLevel > 1) {
      console.log("console.log: The level difference is greater than 1 and it is not supported yet");
      throw new Error("The level difference is greater than 1 and it is not supported yet");
    }

  }

  getRootSymbols(): LevelDocumentSymbol[] {
    return this.allRootSymbols;
  }

}

export class SymbolProvider implements vscode.DocumentSymbolProvider {
  private parseText(text: string): BlockData {
    const data: BlockData = {
      name: "",
      level: 0,
      kind: vscode.SymbolKind.Class,
      start: {} as vscode.TextLine,
      end: {} as vscode.TextLine,
    };
    for (let i = 0; i < text.length; i++) {
      const element = text[i];

      // avoid any comments like ;#region
      if (element === ";") {
        break;
      }

      if (element === "*") {
        data.level++;
      } else {
        data.name += element;
      }
    }
    if (data.level > 1) {
      data.kind = vscode.SymbolKind.Function;
    }
    data.name = data.name.trim();
    return data;
  }

  private createSymbol(block: BlockData): LevelDocumentSymbol {
    return new LevelDocumentSymbol(
      block.name,
      "",
      block.kind,

      // line number range for entire symbol block
      new vscode.Range(block.start.range.start, block.end.range.end),

      // where to put line highlighting
      new vscode.Range(
        new vscode.Position(block.start.lineNumber, block.level + 1),
        new vscode.Position(block.start.lineNumber, block.start.text.length)
      ),
      block.level
    );
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {

    console.log("provideDocumentSymbols is called");

    // const allSymbols: LevelDocumentSymbol[] = [];

    const symbolsHolder = new SymbolsHolder();

    let lineNumber = 0;

    while (lineNumber < document.lineCount) {
      const currentLine = document.lineAt(lineNumber);
      lineNumber++;

      // blocks start with 1 or more asterisks (*), where amount of asterisks determins the level of the block
      // https://beancount.github.io/docs/beancount_language_syntax.html#comments
      if (!currentLine.text.startsWith("*")) {
        continue;
      }

      console.log("Processing the text line ", currentLine.text);

      const result: BlockData = this.parseText(currentLine.text);

      if (!result.name) {
        // detect case where name is not yet provided
        continue;
      }

      result.start = currentLine;
      result.end = currentLine;

      // search for the end of this heading block
      while (lineNumber < document.lineCount) {
        const line = document.lineAt(lineNumber);
        if (!line.text.startsWith("*")) {
          result.end = line;
          lineNumber++;
        } else {
          break;
        }
      }

        symbolsHolder.addSymbol(this.createSymbol(result));
    }

    return symbolsHolder.getRootSymbols();
  }
}
