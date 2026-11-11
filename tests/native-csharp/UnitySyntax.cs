using System;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

// Syntax only. Unity engine APIs, assembly references and lifecycle still need
// actual Editor import. The same pinned SDK supplies the parser and compiler.
static class UnitySyntax
{
    static int Main()
    {
        var options = new CSharpParseOptions(LanguageVersion.CSharp9,
            preprocessorSymbols: new[] { "UNITY_EDITOR", "UNITY_STANDALONE_LINUX", "DEVELOPMENT_BUILD" });
        var files = Directory.GetFiles("apps/unity-client/Assets/VirtualLife", "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Contains(Path.DirectorySeparatorChar + "Generated" + Path.DirectorySeparatorChar))
            .OrderBy(path => path).ToArray();
        if (files.Length == 0) throw new InvalidOperationException("No authored Unity source found");
        var errors = files.SelectMany(path => CSharpSyntaxTree.ParseText(File.ReadAllText(path), options, path)
            .GetDiagnostics().Where(item => item.Severity == DiagnosticSeverity.Error)).ToArray();
        foreach (var error in errors) Console.Error.WriteLine(error.ToString());
        if (errors.Length != 0) return 1;
        Console.WriteLine("Authored Unity C# syntax: " + files.Length + " files passed; Editor compilation NOT_RUN.");
        return 0;
    }
}
