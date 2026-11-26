# Comprovantes do Almox-Admin

Esta pasta organiza os comprovantes por módulo, ano e mês.

## Estrutura

- `passagem-de-plantao/AAAA/MM/`
- `retiradas-avulsas/AAAA/MM/`
- `emprestimos/entrada/AAAA/MM/`
- `emprestimos/saida/AAAA/MM/`
- `estoque/entrada/AAAA/MM/`
- `estoque/saida/AAAA/MM/`

## Padrão sugerido para nomes de arquivos

Use o protocolo e a data do registro, por exemplo:

`PLT-000001_2026-11-26.pdf`
`SAI-000001_2026-11-26.pdf`
`EMP-000001_2026-11-26.pdf`
`ENT-000001_2026-11-26.pdf`

## Importante: privacidade e armazenamento

Este repositório é **público**. Os diretórios são apenas uma estrutura vazia de organização. **Não envie para cá comprovantes reais, PDFs, nomes de colaboradores, protocolos, notas fiscais ou informações operacionais do hospital**, pois qualquer pessoa poderá acessar os arquivos.

O Almox-Admin é uma aplicação estática publicada pelo GitHub Pages. O navegador não pode gravar arquivos diretamente neste repositório de forma segura. Não coloque um token de acesso do GitHub no JavaScript da aplicação: ele ficaria exposto aos visitantes.

Para arquivar comprovantes reais automaticamente, será necessário usar armazenamento privado autorizado pelo hospital (por exemplo, SharePoint/OneDrive com autenticação) ou um serviço de servidor com controle de acesso. A estrutura deste diretório pode ser usada como referência para organizar arquivos em um repositório privado ou em uma pasta privada sincronizada.

Os diretórios de cada mês devem seguir o padrão `AAAA/MM`. O mês deve corresponder à data do comprovante.
