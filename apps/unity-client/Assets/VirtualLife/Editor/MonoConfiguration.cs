using System.IO;
using UnityEditor;
using UnityEditor.Callbacks;

namespace VirtualLife.Editor
{
    public static class MonoConfiguration
    {
        // Unity's Linux Mono player has no machine.config serialization section.
        // Supply only the serializer configuration required by the shared adapter.
        [PostProcessBuild(10)]
        public static void Write(BuildTarget target, string binary)
        {
            if (target != BuildTarget.StandaloneLinux64) return;
            var path = binary.EndsWith(".x86_64") ? binary + ".config" : binary + ".x86_64.config";
            File.WriteAllText(path, @"<?xml version=""1.0"" encoding=""utf-8""?>
<configuration>
  <configSections>
    <sectionGroup name=""system.runtime.serialization"" type=""System.Runtime.Serialization.Configuration.SerializationSectionGroup, System.Runtime.Serialization"">
      <section name=""dataContractSerializer"" type=""System.Runtime.Serialization.Configuration.DataContractSerializerSection, System.Runtime.Serialization"" />
    </sectionGroup>
  </configSections>
  <system.runtime.serialization><dataContractSerializer /></system.runtime.serialization>
</configuration>
");
        }
    }
}
