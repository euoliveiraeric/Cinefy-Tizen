/**
 * Validador de Sintaxe ECMAScript 5 Real via AST (Acorn Parser)
 * Cinefy-Tizen para Samsung Tizen 3.0 (Chromium 47)
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function checkFile(filePath) {
    console.log('----------------------------------------------------');
    console.log('Analisando arquivo:', filePath);
    
    if (!fs.existsSync(filePath)) {
        console.error('ERRO: Arquivo não encontrado:', filePath);
        return false;
    }

    const code = fs.readFileSync(filePath, 'utf8');
    console.log(`Tamanho: ${code.length} bytes | Linhas: ${code.split('\n').length}`);

    try {
        const ast = acorn.parse(code, {
            ecmaVersion: 5,
            locations: true,
            sourceType: 'script'
        });
        console.log('✓ APROVADO NA ANÁLISE SINTÁTICA ESTREITA ES5!');
        console.log(`  Tipo do Nó Raiz: ${ast.type} | Declarações no Corpo: ${ast.body.length}`);
        return true;
    } catch (err) {
        console.error('✗ FALHA DE SINTAXE ES5:');
        console.error(`  Mensagem: ${err.message}`);
        if (err.loc) {
            console.error(`  Localização: Linha ${err.loc.line}, Coluna ${err.loc.column}`);
            const lines = code.split('\n');
            const startLine = Math.max(0, err.loc.line - 3);
            const endLine = Math.min(lines.length, err.loc.line + 2);
            for (let i = startLine; i < endLine; i++) {
                const marker = (i + 1 === err.loc.line) ? ' > ' : '   ';
                console.error(`${marker} ${i + 1}: ${lines[i]}`);
            }
        }
        return false;
    }
}

// Analisar dist/app.js
const appJsPath = path.join(__dirname, 'dist', 'app.js');
const ok = checkFile(appJsPath);

if (!ok) {
    process.exit(1);
} else {
    console.log('\n====================================================');
    console.log('RESULTADO FINAL: Todo o JavaScript executado na TV é 100% ES5 válido.');
    console.log('====================================================');
}
