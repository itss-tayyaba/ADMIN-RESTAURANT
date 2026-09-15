allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir = layout.projectDirectory.dir("D:/build/restaurant-mobile")
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir = layout.projectDirectory.dir("D:/build/restaurant-mobile/${project.name}")
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
