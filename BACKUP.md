# Backup automático em pasta compartilhada

No Edge ou Chrome corporativo, abra o almoxarifado e acesse **Usuários e Auditoria → Backups** e clique em **Autorizar pasta de backup**. Selecione diretamente a pasta `bkps` ao lado do `index.html` para conceder acesso somente aos backups. Se ela ainda não existir, selecione a pasta compartilhada que contém o `index.html` para que o aplicativo crie `bkps`. Confirme a permissão de escrita quando o navegador pedir. A autorização vale por perfil e pode precisar ser renovada.

O navegador precisa permitir a seleção de pastas e a pasta precisa permitir leitura, criação e exclusão conforme as permissões corporativas. Valide a seleção e a primeira cópia em uma estação antes de disponibilizar o fluxo às demais. O acesso deve ser restrito porque o JSON de restauração inclui PINs em texto claro.

Com a página aberta, o backup verifica alterações a cada minuto e grava no máximo uma cópia automática a cada 30 minutos por perfil. A primeira cópia pode sair assim que existir uma base salva. Os arquivos são agrupados por operador ativo e, dentro dele, por identificador do perfil. Antes de uma restauração, pode ser criada uma cópia adicional da base atual.

A limpeza ocorre enquanto a aplicação está aberta e abrange somente os arquivos daquele perfil, inclusive sob operadores diferentes. Preserva todas as cópias das últimas 24 horas, uma cópia válida por dia até 30 dias e a última cópia válida do perfil. Perfis que deixaram de usar a aplicação não executam sua própria limpeza.

Os botões de importação e exportação manual continuam disponíveis. Os dados operacionais seguem em bases locais por perfil.

A pasta `bkps/` é ignorada pelo Git. Mantenha o compartilhamento corporativo restrito e publique apenas os arquivos da aplicação caso seja necessário hospedar uma cópia.
