# 项目维护规则

- 每次面向 main 的更新（功能、修复、UI、文档或配置）都须将 `package.json` 的补丁版本增加 1，并同步 `package-lock.json` 顶层和根包版本。
- 以最新 main 为版本基准；同一 PR 的修订共用一个版本，多个 PR 并行时合并前重新核对。除非用户明确要求，否则不增加 major/minor。
- 可执行 `npm run version:patch` 同步两个包文件；此命令不创建 Git 提交或标签。仅当当前分支尚未增加版本时执行。
- 在 `CHANGELOG.md` 顶部追加该版本、实际更新日期及用户可理解的改动记录，保留历史。网页直接读取此文件，不另建重复日志。
- 页面版本统一从 `package.json` 导入，不写死版本号。
- 完成后运行 `npm run check:release` 和 `npm run build`，并运行与变更相关的测试。
- PR 描述包含版本号、更新摘要和验证结果。只有用户要求时才提交、推送、创建 PR 或合并。
