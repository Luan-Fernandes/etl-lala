import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatasusService } from '../datasus/datasus.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  
  try {
    const service = app.get(DatasusService);
    
    console.log(`\n🚀 Iniciando ETL DATASUS → PostgreSQL`);
    console.log(`📊 Os dados serão inseridos diretamente no banco de dados\n`);
    
    // Executa o fluxo completo:
    // 1. Obtém links dos ZIPs do DATASUS
    // 2. Baixa cada ZIP
    // 3. Extrai arquivos .dbc de cada ZIP
    // 4. Envia cada .dbc para processamento e inserção no PostgreSQL
    // Retorna metadados do processamento
    const metadados = await service.processarLinksPadrao();
    
    console.log(`\n📊 Arquivos .dbc processados: ${metadados.length}\n`);
    
    let totalRegistrosInseridos = 0;
    const tabelasProcessadas = new Set<string>();
    
    metadados.forEach((meta, index) => {
      totalRegistrosInseridos += meta.registros_inseridos;
      tabelasProcessadas.add(meta.tabela_nome);
      
      console.log(`   ✅ [${index + 1}/${metadados.length}] ${meta.arquivo_original}`);
      console.log(`      → Tabela: ${meta.tabela_nome}`);
      console.log(`      → Registros inseridos: ${meta.registros_inseridos.toLocaleString('pt-BR')}`);
      console.log(`      → Competência: ${meta.competencia} | ${meta.tipo_arquivo} | ${meta.estado}`);
    });
    
    console.log(`\n✅ ETL concluído com sucesso!`);
    console.log(`📊 Total de arquivos .dbc processados: ${metadados.length}\n`);
    
    console.log(`📈 Estatísticas:`);
    console.log(`   - Arquivos .dbc: ${metadados.length}`);
    console.log(`   - Total de registros inseridos: ${totalRegistrosInseridos.toLocaleString('pt-BR')}`);
    console.log(`   - Média por arquivo: ${Math.round(totalRegistrosInseridos / metadados.length).toLocaleString('pt-BR')}`);
    console.log(`   - Tabelas distintas: ${tabelasProcessadas.size}`);
    console.log(`   - Fonte: ${metadados[0]?.fonte || 'N/A'}\n`);
    
    console.log(`📋 Tabelas criadas/atualizadas no PostgreSQL:`);
    Array.from(tabelasProcessadas).forEach((tabela, index) => {
      const arquivosDaTabela = metadados.filter(m => m.tabela_nome === tabela);
      const totalRegistros = arquivosDaTabela.reduce((acc, m) => acc + m.registros_inseridos, 0);
      console.log(`   ${index + 1}. ${tabela}: ${totalRegistros.toLocaleString('pt-BR')} registros (${arquivosDaTabela.length} arquivos)`);
    });
    
    console.log('\n✨ Dados inseridos no PostgreSQL com sucesso!\n');
    
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error('\n❌ ETL failed:', e?.message || e);
  process.exit(1);
});
